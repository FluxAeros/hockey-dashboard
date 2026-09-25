import os
import asyncio
import traceback
from collections import defaultdict
from pathlib import Path
from typing import List, Optional, Dict, Any, Set
from contextlib import asynccontextmanager

import httpx
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, HTTPException, Depends, Header, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from db import (
    get_user_by_username_or_email,
    get_user_by_id,
    create_user,
    verify_password,
    create_access_token,
    decode_token,
    get_user_favorites,
    set_user_favorites,
    toggle_user_favorite,
    get_cached_game,
    save_cached_game,
    set_user_admin,
    get_all_users_admin,
    log_page_view,
    create_feedback,
    get_feedback_list,
    update_feedback_status,
    get_admin_analytics_summary
)
from cache import cache

# Double encoding fix for special NHL characters
def fix_double_encoding(data):
    if isinstance(data, str):
        try:
            return data.encode('latin-1').decode('utf-8')
        except (UnicodeEncodeError, UnicodeDecodeError):
            return data
    elif isinstance(data, dict):
        return {k: fix_double_encoding(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [fix_double_encoding(x) for x in data]
    return data


_http_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        limits = httpx.Limits(max_keepalive_connections=20, max_connections=50)
        timeout = httpx.Timeout(10.0, connect=5.0)
        _http_client = httpx.AsyncClient(
            limits=limits,
            timeout=timeout,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},
            follow_redirects=True
        )
    return _http_client


_cached_standings_pctg: Dict[str, float] = {}

async def prime_standings_cache():
    try:
        await get_standings_now()
    except Exception:
        pass


class LiveSyncManager:
    """
    Coordinates real-time game and schedule subscriptions across connected clients.
    Broadcasts live updates so all concurrent users see score changes and events simultaneously.
    """
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.game_subscribers: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.date_subscribers: Dict[str, Set[WebSocket]] = defaultdict(set)
        self.client_subscriptions: Dict[WebSocket, Dict[str, Any]] = {}
        self.send_locks: Dict[WebSocket, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        self.client_subscriptions[websocket] = {"game_id": None, "date": None}
        self.send_locks[websocket] = asyncio.Lock()

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        self.send_locks.pop(websocket, None)
        sub = self.client_subscriptions.pop(websocket, None)
        if sub:
            gid = sub.get("game_id")
            if gid and gid in self.game_subscribers:
                self.game_subscribers[gid].discard(websocket)
                if not self.game_subscribers[gid]:
                    del self.game_subscribers[gid]
            dt = sub.get("date")
            if dt and dt in self.date_subscribers:
                self.date_subscribers[dt].discard(websocket)
                if not self.date_subscribers[dt]:
                    del self.date_subscribers[dt]

    async def _safe_send(self, websocket: WebSocket, message: dict):
        if websocket not in self.active_connections:
            return
        lock = self.send_locks.get(websocket)
        if not lock:
            return
        try:
            async with lock:
                if websocket in self.active_connections:
                    await websocket.send_json(message)
        except Exception:
            self.disconnect(websocket)
            try:
                await websocket.close()
            except Exception:
                pass

    async def handle_client_message(self, websocket: WebSocket, data: dict):
        try:
            msg_type = data.get("type")
            if msg_type == "subscribe":
                new_gid = str(data.get("gameId")) if data.get("gameId") else None
                new_date = str(data.get("date")) if data.get("date") else None
                sub = self.client_subscriptions.get(websocket, {})
                old_gid = sub.get("game_id")
                old_date = sub.get("date")

                if old_gid and old_gid != new_gid:
                    self.game_subscribers[old_gid].discard(websocket)
                if old_date and old_date != new_date:
                    self.date_subscribers[old_date].discard(websocket)

                if new_gid:
                    self.game_subscribers[new_gid].add(websocket)
                if new_date:
                    self.date_subscribers[new_date].add(websocket)

                self.client_subscriptions[websocket] = {"game_id": new_gid, "date": new_date}

                # Immediate response with current cached schedule data if available
                if new_date:
                    cached_schedule = cache.get(f"schedule_{new_date}")
                    if cached_schedule and "games" in cached_schedule:
                        await self._safe_send(websocket, {
                            "type": "schedule_update",
                            "date": new_date,
                            "games": cached_schedule.get("games", [])
                        })

                # For game subscription, only send immediate data if shots are actually present.
                # Otherwise trigger an async fetch and broadcast so we never push empty shots.
                if new_gid:
                    cached_game = cache.get(f"xg_{new_gid}") or get_cached_game(f"xg_{new_gid}")
                    cached_box = cache.get(f"box_{new_gid}") or get_cached_game(f"box_{new_gid}")
                    active_clock = (cached_box.get("clock") if cached_box else None) or (cached_game.get("clock") if cached_game else None)
                    active_pdesc = (cached_box.get("periodDescriptor") if cached_box else None) or (cached_game.get("periodDescriptor") if cached_game else None)
                    if cached_game and cached_game.get("shots"):
                        await self._safe_send(websocket, {
                            "type": "game_update",
                            "gameId": new_gid,
                            "data": {
                                "shots": cached_game.get("shots", []),
                                "winProbability": cached_game.get("winProbability"),
                                "gameState": cached_game.get("gameState") or (cached_box.get("gameState") if cached_box else "FUT"),
                                "clock": active_clock,
                                "periodDescriptor": active_pdesc,
                                "boxscore": cached_box or {}
                            }
                        })
                        asyncio.create_task(self._sync_single_game(new_gid))
                    else:
                        asyncio.create_task(self._sync_single_game(new_gid))
            elif msg_type == "ping":
                await self._safe_send(websocket, {"type": "pong"})
        except Exception as e:
            print(f"Error in handle_client_message: {e}")

    async def _sync_single_game(self, game_id: str):
        try:
            payload = await fetch_game_live_payload(str(game_id), force_fresh=True)
            if payload and payload.get("shots"):
                await self.broadcast_to_game(str(game_id), {
                    "type": "game_update",
                    "gameId": str(game_id),
                    "data": payload
                })
        except Exception:
            pass

    async def broadcast_to_game(self, game_id: str, message: dict):
        gid = str(game_id)
        subscribers = list(self.game_subscribers.get(gid, []))
        if not subscribers:
            return
        tasks = [self._safe_send(ws, message) for ws in subscribers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_to_date(self, date: str, message: dict):
        dt = str(date)
        subscribers = list(self.date_subscribers.get(dt, []))
        if not subscribers:
            return
        tasks = [self._safe_send(ws, message) for ws in subscribers]
        await asyncio.gather(*tasks, return_exceptions=True)

    async def start_sync_loop(self):
        while True:
            try:
                await asyncio.sleep(6)
                if not self.active_connections:
                    continue

                # 1. Sync schedule / game cards for active dates
                dates_to_sync = set(self.date_subscribers.keys())
                for dt in dates_to_sync:
                    if not self.date_subscribers[dt]:
                        continue
                    try:
                        sched = await fetch_schedule_with_scores(dt, force_fresh=True)
                        if sched and "games" in sched:
                            await self.broadcast_to_date(dt, {
                                "type": "schedule_update",
                                "date": dt,
                                "games": sched.get("games", [])
                            })
                    except Exception:
                        pass

                # 2. Sync watched live games
                games_to_sync = set(self.game_subscribers.keys())
                for gid in games_to_sync:
                    if not self.game_subscribers[gid]:
                        continue
                    try:
                        game_data = await fetch_game_live_payload(gid, force_fresh=True)
                        if game_data:
                            await self.broadcast_to_game(gid, {
                                "type": "game_update",
                                "gameId": gid,
                                "data": game_data
                            })
                    except Exception:
                        pass
            except asyncio.CancelledError:
                break
            except Exception:
                await asyncio.sleep(2)


live_sync_manager = LiveSyncManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    sync_task = asyncio.create_task(live_sync_manager.start_sync_loop())
    asyncio.create_task(prime_standings_cache())
    yield
    sync_task.cancel()
    try:
        await sync_task
    except asyncio.CancelledError:
        pass
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()


app = FastAPI(title="NHL Live Expected Goals & Analytics Service", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_origin_regex=r"https?://.*",
    allow_methods=["*"],
    allow_headers=["*"],
)

SHOT_TYPE_CATEGORIES = ['backhand', 'deflected', 'slap', 'snap', 'tip-in', 'wrap-around', 'wrist', 'unknown']

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "xg_model_gb.pkl"
WIN_PROB_MODEL_PATH = BASE_DIR / "win_prob_model.pkl"

try:
    model = joblib.load(MODEL_PATH)
    print(f"Loaded xG model from: {MODEL_PATH}")
except Exception as e:
    print(f"Notice: xG model not loaded: {e}")
    model = None

try:
    win_prob_model = joblib.load(WIN_PROB_MODEL_PATH)
    print(f"Loaded Win Probability model from: {WIN_PROB_MODEL_PATH}")
except Exception as e:
    print(f"Notice: Win probability model not loaded: {e}")
    win_prob_model = None


# Helper functions
def time_to_seconds(time_str: Optional[str]) -> int:
    if not time_str:
        return 0
    parts = time_str.split(':')
    return int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 0


def process_game_plays(plays: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Processes raw play-by-play data into feature sets for xG modeling."""
    shot_events = []
    last_event_time = -999
    last_event_period = -1
    last_event_team = None
    last_event_type = None
    last_event_x = 0
    last_event_y = 0 
    
    for play in plays:
        event_type = play.get('typeDescKey')
        period = play.get('periodDescriptor', {}).get('number')
        time_str = play.get('timeInPeriod')
        current_time_sec = time_to_seconds(time_str)
        details = play.get('details', {})
        current_team = details.get('eventOwnerTeamId')
        
        time_since_last_event = 999
        if period == last_event_period:
            time_since_last_event = current_time_sec - last_event_time

        if event_type in ['shot-on-goal', 'goal']:
            current_x = details.get('xCoord')
            current_y = details.get('yCoord')
            
            if current_x is not None and current_y is not None:
                is_rebound = 1 if (
                    time_since_last_event <= 3 and 
                    current_team == last_event_team and
                    last_event_type in ['shot-on-goal', 'missed-shot']
                ) else 0
                
                is_rush = 1 if (time_since_last_event <= 5 and is_rebound == 0) else 0

                crossed_royal_road = 0
                if last_event_y != 0 and current_y != 0:
                    if (last_event_y * current_y) < 0 and time_since_last_event <= 3:
                        if abs(current_x) > 25 and abs(last_event_x) > 25:
                            crossed_royal_road = 1

                # Calculate geometric properties
                dx = 89 - abs(current_x)
                distance = np.sqrt(dx**2 + current_y**2)
                angle = np.arctan(abs(current_y) / (dx + 1e-5)) * (180 / np.pi)
                
                situation = play.get('situationCode', '1551')
                is_5v5 = 1 if str(situation)[1:3] == '55' else 0
                shot_type = details.get('shotType', 'unknown')

                shot_events.append({
                    'raw_x': current_x,
                    'raw_y': current_y,
                    'distance': float(distance),
                    'angle': float(angle),
                    'is_rebound': is_rebound,
                    'is_rush': is_rush,
                    'crossed_royal_road': crossed_royal_road,
                    'is_5v5': is_5v5,
                    'shot_type': shot_type,
                    'is_goal': 1 if event_type == 'goal' else 0,
                    'is_sog': 1 if event_type in ['shot-on-goal', 'goal'] else 0,
                    'event_type': event_type,
                    'team_id': current_team,
                    'team_desc': play.get('details', {}).get('typeDescKey', '')
                })

        last_event_time = current_time_sec
        last_event_period = period
        last_event_team = current_team
        last_event_type = event_type
        if details.get('yCoord') is not None and details.get('xCoord') is not None:
            last_event_x = details.get('xCoord')
            last_event_y = details.get('yCoord')
            
    return shot_events


ADMIN_EMAILS = [e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()]

# ==========================================
# Auth & Telemetry Schemas & Dependencies
# ==========================================

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class LoginRequest(BaseModel):
    username_or_email: str
    password: str

class FavoritesRequest(BaseModel):
    team_abbrevs: List[str]

class ToggleFavoriteRequest(BaseModel):
    team_abbrev: str

class PageViewRequest(BaseModel):
    path: str
    referrer: Optional[str] = None
    session_id: Optional[str] = None
    device_type: Optional[str] = "desktop"

class FeedbackRequest(BaseModel):
    category: Optional[str] = "general"
    rating: Optional[int] = None
    message: str
    username: Optional[str] = None
    email: Optional[str] = None

class UpdateFeedbackStatusRequest(BaseModel):
    status: str

class ToggleAdminRequest(BaseModel):
    is_admin: bool


async def get_current_user_optional(authorization: Optional[str] = Header(None)) -> Optional[Dict[str, Any]]:
    if not authorization:
        return None
    try:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        else:
            token = authorization
        payload = decode_token(token)
        if not payload:
            return None
        user_id = int(payload.get("sub"))
        user = get_user_by_id(user_id)
        if user:
            return user.to_dict()
    except Exception:
        pass
    return None


async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    user = await get_current_user_optional(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token.")
    return user


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin authorization required.")
    return user


# ==========================================
# Auth Endpoints
# ==========================================

@app.post("/auth/register")
def register(req: RegisterRequest):
    if len(req.username.strip()) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters.")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if "@" not in req.email:
        raise HTTPException(status_code=400, detail="Invalid email address.")

    existing = get_user_by_username_or_email(req.username) or get_user_by_username_or_email(req.email)
    if existing:
        raise HTTPException(status_code=409, detail="A user with that username or email already exists.")

    is_initial_admin = req.email.strip().lower() in ADMIN_EMAILS
    user = create_user(req.username, req.email, req.password, is_admin=is_initial_admin)
    token = create_access_token(user.id, user.username)
    return {
        "token": token,
        "user": user.to_dict()
    }


@app.post("/auth/login")
def login(req: LoginRequest):
    user = get_user_by_username_or_email(req.username_or_email)
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username/email or password.")

    if (user.email.lower() in ADMIN_EMAILS or user.username.lower() in ADMIN_EMAILS) and not user.is_admin:
        user = set_user_admin(user.id, True) or user

    token = create_access_token(user.id, user.username)
    return {
        "token": token,
        "user": user.to_dict()
    }


@app.get("/auth/me")
def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": user}


# ==========================================
# Telemetry & Feedback Endpoints (Public)
# ==========================================

@app.post("/telemetry/pageview")
async def record_page_view(
    req: PageViewRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    user_id = current_user["id"] if current_user else None
    log_page_view(
        path=req.path,
        referrer=req.referrer,
        user_id=user_id,
        session_id=req.session_id,
        device_type=req.device_type or "desktop"
    )
    return {"status": "ok"}


@app.post("/feedback")
async def submit_feedback(
    req: FeedbackRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional)
):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Feedback message cannot be empty.")

    user_id = current_user["id"] if current_user else None
    username = current_user["username"] if current_user else req.username
    email = current_user["email"] if current_user else req.email

    fb = create_feedback(
        message=req.message,
        category=req.category or "general",
        rating=req.rating,
        user_id=user_id,
        username=username,
        email=email
    )
    return {"status": "ok", "feedback": fb}


# ==========================================
# Admin Endpoints (Protected)
# ==========================================

@app.get("/admin/overview")
def get_admin_overview(admin: Dict[str, Any] = Depends(require_admin)):
    summary = get_admin_analytics_summary()
    return summary


@app.get("/admin/users")
def get_admin_users(
    search: str = "",
    limit: int = 100,
    admin: Dict[str, Any] = Depends(require_admin)
):
    users = get_all_users_admin(search=search, limit=limit)
    return {"users": users}


@app.post("/admin/users/{user_id}/toggle-admin")
def toggle_user_admin_privilege(
    user_id: int,
    req: ToggleAdminRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    if admin["id"] == user_id and not req.is_admin:
        raise HTTPException(status_code=400, detail="You cannot revoke your own admin permissions.")

    user = set_user_admin(user_id, req.is_admin)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return {"user": user.to_dict()}


@app.get("/admin/feedback")
def get_admin_feedback(
    status: Optional[str] = None,
    category: Optional[str] = None,
    admin: Dict[str, Any] = Depends(require_admin)
):
    feedback_list = get_feedback_list(status=status, category=category)
    return {"feedback": feedback_list}


@app.patch("/admin/feedback/{feedback_id}")
def update_feedback_status_endpoint(
    feedback_id: int,
    req: UpdateFeedbackStatusRequest,
    admin: Dict[str, Any] = Depends(require_admin)
):
    updated = update_feedback_status(feedback_id, req.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Feedback not found.")
    return {"feedback": updated}


@app.get("/user/favorites")
def get_favorites(user: Dict[str, Any] = Depends(get_current_user)):
    favs = get_user_favorites(user["id"])
    return {"favorites": favs}


@app.post("/user/favorites")
def set_favorites(req: FavoritesRequest, user: Dict[str, Any] = Depends(get_current_user)):
    favs = set_user_favorites(user["id"], req.team_abbrevs)
    return {"favorites": favs}


@app.post("/user/favorites/toggle")
def toggle_favorite(req: ToggleFavoriteRequest, user: Dict[str, Any] = Depends(get_current_user)):
    favs = toggle_user_favorite(user["id"], req.team_abbrev)
    return {"favorites": favs}


@app.get("/user/tailored-feed")
async def get_tailored_feed(user: Dict[str, Any] = Depends(get_current_user)):
    favs = get_user_favorites(user["id"])
    if not favs:
        return {"favorites": [], "upcomingGames": [], "recentGames": [], "standings": []}

    fav_set = set(favs)
    client = get_http_client()

    # Fetch standings
    standings_data = await get_standings_now()
    fav_standings = [
        s for s in standings_data.get("standings", [])
        if s.get("teamAbbrev", {}).get("default") in fav_set
    ]

    # Fetch current week schedule
    schedule_data = await get_schedule_week()
    game_week = schedule_data.get("gameWeek", [])
    
    upcoming_games = []
    recent_games = []

    for day in game_week:
        for game in day.get("games", []):
            away_abbr = game.get("awayTeam", {}).get("abbrev")
            home_abbr = game.get("homeTeam", {}).get("abbrev")
            
            if away_abbr in fav_set or home_abbr in fav_set:
                state = game.get("gameState")
                if state in ["FINAL", "OFF"]:
                    recent_games.append({**game, "gameDate": day.get("date")})
                else:
                    upcoming_games.append({**game, "gameDate": day.get("date")})

    return fix_double_encoding({
        "favorites": favs,
        "upcomingGames": upcoming_games[:6],
        "recentGames": recent_games[-6:],
        "standings": fav_standings
    })


# ==========================================
# Core Analytics & NHL Endpoints (Cached)
# ==========================================

@app.get("/")
def root():
    return {"status": "ok", "message": "NHL Live Expected Goals & Analytics Service is running", "cached": True}


@app.get("/health")
def health():
    return {"status": "healthy"}


def compute_win_probability(
    processed_shots: List[Dict[str, Any]],
    plays: List[Dict[str, Any]],
    home_team_id: Optional[int],
    away_team_id: Optional[int],
    home_abbrev: str,
    away_abbrev: str,
    game_state: str
) -> Optional[Dict[str, float]]:
    try:
        home_goals = sum(1 for s in processed_shots if s.get('is_goal') == 1 and s.get('team_id') == home_team_id)
        away_goals = sum(1 for s in processed_shots if s.get('is_goal') == 1 and s.get('team_id') == away_team_id)
        home_xg = sum(s.get('xg', 0.0) for s in processed_shots if s.get('team_id') == home_team_id)
        away_xg = sum(s.get('xg', 0.0) for s in processed_shots if s.get('team_id') == away_team_id)
        home_shots = sum(1 for s in processed_shots if s.get('team_id') == home_team_id)
        away_shots = sum(1 for s in processed_shots if s.get('team_id') == away_team_id)

        if game_state in ["FINAL", "OFF"]:
            if home_goals > away_goals:
                home_prob = 100.0
            else:
                home_prob = 0.0
            away_prob = round(100.0 - home_prob, 1)
            return {"homeProb": home_prob, "awayProb": away_prob}

        if game_state in ["FUT", "PRE"] or not plays:
            home_pctg = _cached_standings_pctg.get(home_abbrev, 0.5)
            away_pctg = _cached_standings_pctg.get(away_abbrev, 0.5)
            logit = 0.14 + (home_pctg - away_pctg) * 3.5
            home_prob = (1.0 / (1.0 + np.exp(-logit))) * 100
            home_prob = min(99.5, max(0.5, round(home_prob, 1)))
            away_prob = round(100.0 - home_prob, 1)
            return {"homeProb": home_prob, "awayProb": away_prob}

        last_play = plays[-1] if plays else {}
        period = last_play.get('periodDescriptor', {}).get('number', 1)
        time_in_period = time_to_seconds(last_play.get('timeInPeriod', '00:00'))
        seconds_elapsed = min(3600, (period - 1) * 1200 + time_in_period)
        seconds_remaining = max(0, 3600 - seconds_elapsed)

        situation_code = str(last_play.get('situationCode', '1551'))
        away_skaters = int(situation_code[1]) if len(situation_code) == 4 else 5
        home_skaters = int(situation_code[2]) if len(situation_code) == 4 else 5
        manpower_diff = home_skaters - away_skaters

        score_diff = home_goals - away_goals
        xg_diff = home_xg - away_xg
        shots_diff = home_shots - away_shots

        if win_prob_model:
            features_df = pd.DataFrame([{
                'score_diff': score_diff,
                'seconds_remaining': seconds_remaining,
                'period': min(period, 3),
                'manpower_diff': manpower_diff,
                'xg_diff': xg_diff,
                'shots_diff': shots_diff
            }])
            home_prob = float(win_prob_model.predict_proba(features_df)[0][1]) * 100
        else:
            logit = 0.14 + (score_diff * 1.35) + (xg_diff * 0.55) + (shots_diff * 0.05)
            home_prob = (1.0 / (1.0 + np.exp(-logit))) * 100

        home_prob = min(99.5, max(0.5, round(home_prob, 1)))
        away_prob = round(100.0 - home_prob, 1)
        return {"homeProb": home_prob, "awayProb": away_prob}
    except Exception:
        return None


def estimate_game_win_prob(
    game: Dict[str, Any],
    home_abbrev: str,
    away_abbrev: str
) -> Optional[Dict[str, float]]:
    try:
        state = (game.get("gameState") or "").upper()
        home_score = (game.get("homeTeam", {}) or {}).get("score", 0)
        away_score = (game.get("awayTeam", {}) or {}).get("score", 0)
        if home_score is None:
            home_score = 0
        if away_score is None:
            away_score = 0

        if state in ["FINAL", "OFF", "OVER"]:
            if home_score > away_score:
                return {"homeProb": 100.0, "awayProb": 0.0}
            elif away_score > home_score:
                return {"homeProb": 0.0, "awayProb": 100.0}
            return {"homeProb": 50.0, "awayProb": 50.0}

        if state in ["FUT", "PRE"]:
            home_pctg = _cached_standings_pctg.get(home_abbrev, 0.5)
            away_pctg = _cached_standings_pctg.get(away_abbrev, 0.5)
            logit = 0.14 + (home_pctg - away_pctg) * 3.5
            home_prob = (1.0 / (1.0 + np.exp(-logit))) * 100
            home_prob = min(99.5, max(0.5, round(home_prob, 1)))
            return {"homeProb": home_prob, "awayProb": round(100.0 - home_prob, 1)}

        if state in ["LIVE", "CRIT"]:
            home_sog = (game.get("homeTeam", {}) or {}).get("sog")
            away_sog = (game.get("awayTeam", {}) or {}).get("sog")
            if home_sog is None:
                home_sog = home_score * 5
            if away_sog is None:
                away_sog = away_score * 5

            pdesc = game.get("periodDescriptor", {}) or {}
            period = pdesc.get("number", 1) or 1
            clock = game.get("clock", {}) or {}
            sec_rem = clock.get("secondsRemaining")
            if sec_rem is None:
                time_rem = clock.get("timeRemaining", "20:00")
                sec_rem = time_to_seconds(time_rem) if time_rem else 1200

            seconds_elapsed = min(3600, (period - 1) * 1200 + max(0, 1200 - sec_rem))
            seconds_remaining = max(0, 3600 - seconds_elapsed)

            score_diff = home_score - away_score
            shots_diff = home_sog - away_sog
            xg_diff = shots_diff * 0.075

            if win_prob_model:
                try:
                    features_df = pd.DataFrame([{
                        'score_diff': score_diff,
                        'seconds_remaining': seconds_remaining,
                        'period': min(period, 3),
                        'manpower_diff': 0,
                        'xg_diff': xg_diff,
                        'shots_diff': shots_diff
                    }])
                    home_prob = float(win_prob_model.predict_proba(features_df)[0][1]) * 100
                except Exception:
                    logit = 0.14 + (score_diff * 1.35) + (xg_diff * 0.55) + (shots_diff * 0.05)
                    home_prob = (1.0 / (1.0 + np.exp(-logit))) * 100
            else:
                logit = 0.14 + (score_diff * 1.35) + (xg_diff * 0.55) + (shots_diff * 0.05)
                home_prob = (1.0 / (1.0 + np.exp(-logit))) * 100

            home_prob = min(99.5, max(0.5, round(home_prob, 1)))
            return {"homeProb": home_prob, "awayProb": round(100.0 - home_prob, 1)}

        return None
    except Exception:
        return None


async def fetch_game_live_payload(gid: str, force_fresh: bool = False) -> Dict[str, Any]:
    pbp_key = f"xg_{gid}"
    box_key = f"box_{gid}"

    if not force_fresh:
        # Check SQLite for finished game
        persistent_pbp = get_cached_game(pbp_key)
        persistent_box = get_cached_game(box_key)
        if persistent_pbp and len(persistent_pbp.get("shots", [])) > 0:
            return {
                "shots": persistent_pbp.get("shots", []),
                "winProbability": persistent_pbp.get("winProbability"),
                "gameState": persistent_pbp.get("gameState", "FINAL"),
                "clock": persistent_box.get("clock") if persistent_box else None,
                "periodDescriptor": persistent_box.get("periodDescriptor") if persistent_box else None,
                "timeouts": persistent_pbp.get("timeouts", {"homeRemaining": 1, "awayRemaining": 1}),
                "powerPlay": persistent_pbp.get("powerPlay") or {"hasPowerPlay": False, "advantage": "5-on-5", "ppTeamAbbr": "", "shortHandedTeamAbbr": ""},
                "boxscore": persistent_box or {}
            }

        cached_pbp = cache.get(pbp_key)
        cached_box = cache.get(box_key)
        if cached_pbp and cached_box:
            return {
                "shots": cached_pbp.get("shots", []),
                "winProbability": cached_pbp.get("winProbability"),
                "gameState": cached_pbp.get("gameState", "FUT"),
                "clock": cached_box.get("clock"),
                "periodDescriptor": cached_box.get("periodDescriptor"),
                "timeouts": cached_pbp.get("timeouts", {"homeRemaining": 1, "awayRemaining": 1}),
                "powerPlay": cached_pbp.get("powerPlay") or {"hasPowerPlay": False, "advantage": "5-on-5", "ppTeamAbbr": "", "shortHandedTeamAbbr": ""},
                "boxscore": cached_box
            }

    client = get_http_client()
    pbp_url = f"https://api-web.nhle.com/v1/gamecenter/{gid}/play-by-play"
    box_url = f"https://api-web.nhle.com/v1/gamecenter/{gid}/boxscore"

    pbp_res, box_res = await asyncio.gather(
        client.get(pbp_url),
        client.get(box_url),
        return_exceptions=True
    )

    box_data = {}
    game_state = "FUT"
    if not isinstance(box_res, Exception) and box_res.status_code == 200:
        box_data = fix_double_encoding(box_res.json())
        game_state = box_data.get("gameState", "FUT")
        ttl = 8 if game_state in ["LIVE", "CRIT"] else 60
        cache.set(box_key, box_data, ttl=ttl)
        if game_state in ["FINAL", "OFF"] and (box_data.get("boxscore") or box_data.get("playerByGameStats")):
            save_cached_game(box_key, game_state, box_data)

    processed_shots = []
    win_prob = None
    timeouts_data = {"homeRemaining": 1, "awayRemaining": 1}
    power_play_data = {"hasPowerPlay": False, "advantage": "5-on-5", "ppTeamAbbr": "", "shortHandedTeamAbbr": ""}

    if not isinstance(pbp_res, Exception) and pbp_res.status_code == 200:
        pbp_data = pbp_res.json()
        game_state = pbp_data.get("gameState", game_state)
        plays = pbp_data.get('plays', [])
        processed_shots = process_game_plays(plays)

        if processed_shots and model:
            df_features = pd.DataFrame(processed_shots)
            features = ['distance', 'angle', 'is_rebound', 'is_rush', 'crossed_royal_road', 'is_5v5', 'shot_type']
            X = df_features[features].copy()
            X['shot_type'] = (
                X['shot_type']
                .fillna('unknown')
                .str.lower()
                .apply(lambda x: x if x in SHOT_TYPE_CATEGORIES else 'unknown')
                .astype(pd.CategoricalDtype(categories=SHOT_TYPE_CATEGORIES, ordered=False))
            )
            probabilities = model.predict_proba(X)[:, 1]
            for idx, prob in enumerate(probabilities):
                processed_shots[idx]['xg'] = float(prob)

        home_id = pbp_data.get("homeTeam", {}).get("id") or box_data.get("homeTeam", {}).get("id")
        away_id = pbp_data.get("awayTeam", {}).get("id") or box_data.get("awayTeam", {}).get("id")
        home_abbr = pbp_data.get("homeTeam", {}).get("abbrev", "") or box_data.get("homeTeam", {}).get("abbrev", "")
        away_abbr = pbp_data.get("awayTeam", {}).get("abbrev", "") or box_data.get("awayTeam", {}).get("abbrev", "")

        win_prob = compute_win_probability(
            processed_shots=processed_shots,
            plays=plays,
            home_team_id=home_id,
            away_team_id=away_id,
            home_abbrev=home_abbr,
            away_abbrev=away_abbr,
            game_state=game_state
        )

        pbp_clock = pbp_data.get("clock")
        pbp_period = pbp_data.get("periodDescriptor")
        clock = box_data.get("clock") or pbp_clock
        period_descriptor = box_data.get("periodDescriptor") or pbp_period

        # Parse timeouts
        home_timeout_used = False
        away_timeout_used = False
        for p in plays:
            if p.get("typeDescKey") == "stoppage":
                det = p.get("details", {})
                r1 = str(det.get("reason", "")).lower()
                r2 = str(det.get("secondaryReason", "")).lower()
                if "home-timeout" in r1 or "home-timeout" in r2:
                    home_timeout_used = True
                elif "visitor-timeout" in r1 or "visitor-timeout" in r2 or "away-timeout" in r1:
                    away_timeout_used = True

        timeouts_data = {
            "homeRemaining": 0 if home_timeout_used else 1,
            "awayRemaining": 0 if away_timeout_used else 1
        }

        # Parse roster map for player details & headshots
        roster_map = {}
        for r in pbp_data.get("rosterSpots", []):
            pid = r.get("playerId")
            if pid:
                fn = r.get("firstName", {}).get("default", "") if isinstance(r.get("firstName"), dict) else str(r.get("firstName", ""))
                ln = r.get("lastName", {}).get("default", "") if isinstance(r.get("lastName"), dict) else str(r.get("lastName", ""))
                name = f"{fn} {ln}".strip()
                headshot = r.get("headshot") or f"https://assets.nhle.com/mugs/nhl/latest/{pid}.png"
                roster_map[pid] = {
                    "name": name,
                    "sweaterNumber": r.get("sweaterNumber"),
                    "positionCode": r.get("positionCode"),
                    "headshot": headshot
                }

        # Parse manpower & active power play / penalty
        last_play = plays[-1] if plays else {}
        sit_code = str(last_play.get("situationCode", "1551"))
        away_skaters = int(sit_code[1]) if len(sit_code) == 4 and sit_code[1].isdigit() else 5
        home_skaters = int(sit_code[2]) if len(sit_code) == 4 and sit_code[2].isdigit() else 5

        has_pp = False
        pp_abbr = ""
        pp_id = None
        sh_abbr = ""
        sh_id = None
        advantage = "5-on-5"

        if home_skaters > away_skaters:
            has_pp = True
            pp_abbr = home_abbr
            pp_id = home_id
            sh_abbr = away_abbr
            sh_id = away_id
            advantage = f"{home_skaters}-on-{away_skaters}"
        elif away_skaters > home_skaters:
            has_pp = True
            pp_abbr = away_abbr
            pp_id = away_id
            sh_abbr = home_abbr
            sh_id = home_id
            advantage = f"{away_skaters}-on-{home_skaters}"

        active_penalty = None
        if has_pp:
            for p in reversed(plays):
                if p.get("typeDescKey") == "penalty":
                    det = p.get("details", {})
                    event_team = det.get("eventOwnerTeamId")
                    if event_team == sh_id or not event_team:
                        pid = det.get("committedByPlayerId") or det.get("servedByPlayerId")
                        desc_k = det.get("descKey", "minor-penalty")
                        infraction = desc_k.replace("-", " ").title()
                        duration = det.get("duration", 2)

                        pen_period = p.get("periodDescriptor", {}).get("number", 1)
                        pen_time_sec = time_to_seconds(p.get("timeInPeriod", "00:00"))
                        curr_period = period_descriptor.get("number", 1) if period_descriptor else pen_period
                        curr_time_sec = 0
                        if clock and clock.get("timeRemaining"):
                            rem_sec = clock.get("secondsRemaining")
                            if rem_sec is None:
                                rem_sec = time_to_seconds(clock.get("timeRemaining", "20:00"))
                            curr_time_sec = 1200 - rem_sec

                        elapsed_penalty = 0
                        if curr_period == pen_period:
                            elapsed_penalty = max(0, curr_time_sec - pen_time_sec)
                        elif curr_period > pen_period:
                            elapsed_penalty = (1200 - pen_time_sec) + curr_time_sec

                        penalty_total_sec = duration * 60
                        penalty_rem_sec = max(0, penalty_total_sec - elapsed_penalty)
                        m = penalty_rem_sec // 60
                        s = penalty_rem_sec % 60
                        time_rem_str = f"{m:02d}:{s:02d}"

                        player_info = roster_map.get(pid, {})
                        active_penalty = {
                            "playerId": pid,
                            "playerName": player_info.get("name", "Penalized Player"),
                            "sweaterNumber": player_info.get("sweaterNumber"),
                            "positionCode": player_info.get("positionCode"),
                            "headshot": player_info.get("headshot", f"https://assets.nhle.com/mugs/nhl/latest/{pid}.png"),
                            "infraction": infraction,
                            "durationMinutes": duration,
                            "timeRemaining": time_rem_str,
                            "secondsRemaining": penalty_rem_sec
                        }
                        break

        power_play_data = {
            "hasPowerPlay": has_pp,
            "ppTeamAbbr": pp_abbr,
            "ppTeamId": pp_id,
            "advantage": advantage,
            "shortHandedTeamAbbr": sh_abbr,
            "shortHandedTeamId": sh_id,
            "penalty": active_penalty
        }

        pbp_result = fix_double_encoding({
            "shots": processed_shots,
            "winProbability": win_prob,
            "gameState": game_state,
            "clock": clock,
            "periodDescriptor": period_descriptor,
            "timeouts": timeouts_data,
            "powerPlay": power_play_data
        })

        ttl = 8 if game_state in ["LIVE", "CRIT"] else 60
        cache.set(pbp_key, pbp_result, ttl=ttl)

        if game_state in ["FINAL", "OFF"] and len(processed_shots) > 0:
            save_cached_game(pbp_key, game_state, pbp_result)
    else:
        clock = box_data.get("clock")
        period_descriptor = box_data.get("periodDescriptor")

    return {
        "shots": processed_shots,
        "winProbability": win_prob,
        "gameState": game_state,
        "clock": clock,
        "periodDescriptor": period_descriptor,
        "timeouts": timeouts_data,
        "powerPlay": power_play_data,
        "boxscore": box_data
    }


async def fetch_schedule_with_scores(date: str, force_fresh: bool = False) -> Dict[str, Any]:
    cache_key = f"schedule_{date}"
    if not force_fresh:
        cached = cache.get(cache_key)
        if cached:
            return cached

    client = get_http_client()
    sched_url = f"https://api-web.nhle.com/v1/schedule/{date}"
    score_url = f"https://api-web.nhle.com/v1/score/{date}"

    sched_res, score_res = await asyncio.gather(
        client.get(sched_url),
        client.get(score_url),
        return_exceptions=True
    )

    if isinstance(sched_res, Exception) or sched_res.status_code != 200:
        return {"games": [], "gameWeek": [], "nextStartDate": None, "previousStartDate": None}

    sched_data = sched_res.json()
    game_week = sched_data.get("gameWeek", [])
    day = next((d for d in game_week if d.get("date") == date), None)
    games = day.get("games", []) if day else []

    score_games = {}
    if not isinstance(score_res, Exception) and score_res.status_code == 200:
        for sg in score_res.json().get("games", []):
            score_games[sg.get("id")] = sg

    any_active = False
    for g in games:
        gid = g.get("id")
        sg = score_games.get(gid)
        if sg:
            if sg.get("gameState"):
                g["gameState"] = sg["gameState"]
            if "awayTeam" in sg and "score" in sg["awayTeam"]:
                g.setdefault("awayTeam", {})["score"] = sg["awayTeam"]["score"]
            if "homeTeam" in sg and "score" in sg["homeTeam"]:
                g.setdefault("homeTeam", {})["score"] = sg["homeTeam"]["score"]
            if "awayTeam" in sg and "sog" in sg["awayTeam"]:
                g.setdefault("awayTeam", {})["sog"] = sg["awayTeam"]["sog"]
            if "homeTeam" in sg and "sog" in sg["homeTeam"]:
                g.setdefault("homeTeam", {})["sog"] = sg["homeTeam"]["sog"]
            if "clock" in sg:
                g["clock"] = sg["clock"]
            if "periodDescriptor" in sg:
                g["periodDescriptor"] = sg["periodDescriptor"]

        state = (g.get("gameState") or "").upper()
        if state in ["LIVE", "CRIT", "PRE"]:
            any_active = True

        pbp_key = f"xg_{gid}"
        cached_pbp = cache.get(pbp_key) or get_cached_game(pbp_key)
        if cached_pbp and cached_pbp.get("winProbability"):
            g["winProbability"] = cached_pbp["winProbability"]
        else:
            home_abbr = g.get("homeTeam", {}).get("abbrev", "")
            away_abbr = g.get("awayTeam", {}).get("abbrev", "")
            g["winProbability"] = estimate_game_win_prob(g, home_abbr, away_abbr)

    result = fix_double_encoding({
        "games": games,
        "gameWeek": game_week,
        "nextStartDate": sched_data.get("nextStartDate"),
        "previousStartDate": sched_data.get("previousStartDate")
    })

    ttl = 8 if any_active else 120
    cache.set(cache_key, result, ttl=ttl)
    return result


@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await live_sync_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            await live_sync_manager.handle_client_message(websocket, data)
    except (WebSocketDisconnect, Exception):
        live_sync_manager.disconnect(websocket)


@app.get("/game/{game_id}")
async def get_live_game_xg(game_id: str):
    gid = str(game_id)
    persistent_cached = get_cached_game(f"xg_{gid}")
    if persistent_cached and len(persistent_cached.get("shots", [])) > 0:
        return persistent_cached

    cached = cache.get(f"xg_{gid}")
    if cached:
        return cached

    payload = await fetch_game_live_payload(gid)
    res = {
        "shots": payload["shots"],
        "winProbability": payload["winProbability"],
        "gameState": payload["gameState"],
        "timeouts": payload.get("timeouts"),
        "powerPlay": payload.get("powerPlay")
    }
    await live_sync_manager.broadcast_to_game(gid, {
        "type": "game_update",
        "gameId": gid,
        "data": payload
    })
    return res


@app.get("/game/{game_id}/win-prob")
async def get_game_win_prob(game_id: str):
    gid = str(game_id)
    cached = cache.get(f"xg_{gid}")
    if cached and cached.get("winProbability") is not None:
        return cached["winProbability"]
    data = await get_live_game_xg(game_id)
    return data.get("winProbability", {})


@app.get("/schedule/{date}")
async def get_schedule(date: str):
    return await fetch_schedule_with_scores(date)


@app.get("/schedule-week/now")
async def get_schedule_week():
    async def fetch_week():
        client = get_http_client()
        url = "https://api-web.nhle.com/v1/schedule/now"
        res = await client.get(url)
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail="Schedule not found.")
        return fix_double_encoding(res.json())

    return await cache.get_or_set("schedule_now", fetch_week, ttl=120)


@app.get("/boxscore/{game_id}")
async def get_boxscore(game_id: str):
    gid = str(game_id)
    persistent_cached = get_cached_game(f"box_{gid}")
    if persistent_cached and (persistent_cached.get("boxscore") or persistent_cached.get("playerByGameStats")):
        return persistent_cached

    cached = cache.get(f"box_{gid}")
    if cached:
        return cached

    payload = await fetch_game_live_payload(gid)
    return payload.get("boxscore", {})


@app.get("/matchups/{game_id}")
async def get_matchups(game_id: str):
    gid = str(game_id)

    persistent_cached = get_cached_game(f"matchups_{gid}")
    if persistent_cached and persistent_cached.get("matchups") and len(persistent_cached["matchups"]) > 0:
        return persistent_cached

    async def compute_matchups():
        client = get_http_client()
        boxscore_url = f"https://api-web.nhle.com/v1/gamecenter/{gid}/boxscore"
        box_res = await client.get(boxscore_url)
        
        player_positions = {}
        game_state = "LIVE"
        if box_res.status_code == 200:
            box_data = box_res.json()
            game_state = box_data.get("gameState", "LIVE")
            stats = box_data.get('playerByGameStats', {})
            for team_key in ['awayTeam', 'homeTeam']:
                team_stats = stats.get(team_key, {})
                for f in team_stats.get('forwards', []):
                    if 'playerId' in f:
                        player_positions[f['playerId']] = 'F'
                for d in team_stats.get('defense', []):
                    if 'playerId' in d:
                        player_positions[d['playerId']] = 'D'

        shift_url = f"https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId={gid}"
        shift_res = await client.get(shift_url)
        if shift_res.status_code != 200:
            return {}

        data = shift_res.json().get('data', [])

        def to_absolute_seconds(period, time_str):
            if not time_str: return 0
            m, s = map(int, time_str.split(':'))
            return (period - 1) * 1200 + m * 60 + s

        shifts = []
        teams = set()

        for d in data:
            player_id = d.get('playerId')
            pos = player_positions.get(player_id)
            if not pos or not d.get('startTime') or not d.get('endTime'):
                continue
            start = to_absolute_seconds(d['period'], d['startTime'])
            end = to_absolute_seconds(d['period'], d['endTime'])
            if end <= start:
                continue

            teams.add(d['teamId'])
            shifts.append({
                'id': player_id,
                'name': f"{d['firstName']} {d['lastName']}",
                'team_id': d['teamId'],
                'pos': pos,
                'start': start,
                'end': end
            })

        if len(teams) != 2:
            return {}

        t1_id, t2_id = list(teams)
        t1_shifts = [s for s in shifts if s['team_id'] == t1_id]
        t2_shifts = [s for s in shifts if s['team_id'] == t2_id]

        overlaps = {}
        for s1 in t1_shifts:
            for s2 in t2_shifts:
                if s1['pos'] != s2['pos']:
                    continue
                overlap_start = max(s1['start'], s2['start'])
                overlap_end = min(s1['end'], s2['end'])
                duration = overlap_end - overlap_start
                if duration > 0:
                    key = (s1['id'], s1['name'], s2['id'], s2['name'])
                    overlaps[key] = overlaps.get(key, 0) + duration

        t1_matchups = {}
        t2_matchups = {}

        for (id1, n1, id2, n2), secs in overlaps.items():
            if secs < 60:
                continue
            if id1 not in t1_matchups:
                t1_matchups[id1] = {"name": n1, "opponents": []}
            t1_matchups[id1]["opponents"].append({"id": id2, "name": n2, "overlap_seconds": secs})

            if id2 not in t2_matchups:
                t2_matchups[id2] = {"name": n2, "opponents": []}
            t2_matchups[id2]["opponents"].append({"id": id1, "name": n1, "overlap_seconds": secs})

        player_positions_by_id = {s['id']: s['pos'] for s in shifts}

        def build_player_list(matchup_dict):
            players = []
            for p_id, p_data in matchup_dict.items():
                pos = player_positions_by_id.get(p_id, "F")
                p_data["opponents"].sort(key=lambda x: x['overlap_seconds'], reverse=True)
                limit = 3 if pos == 'F' else 2
                players.append({
                    "id": p_id,
                    "name": p_data["name"],
                    "position": pos,
                    "opponents": p_data["opponents"][:limit]
                })
            players.sort(key=lambda x: x['opponents'][0]['overlap_seconds'] if x['opponents'] else 0, reverse=True)
            return players

        matchup_result = fix_double_encoding({
            "team1": {"id": t1_id, "players": build_player_list(t1_matchups)},
            "team2": {"id": t2_id, "players": build_player_list(t2_matchups)}
        })

        if game_state in ["FINAL", "OFF"] and (len(matchup_result.get("team1", {}).get("players", [])) > 0 or len(matchup_result.get("team2", {}).get("players", [])) > 0):
            save_cached_game(f"matchups_{gid}", game_state, matchup_result)

        return matchup_result

    return await cache.get_or_set(f"matchups_{gid}", compute_matchups, ttl=30)


@app.get("/roster/{team_abbr}")
async def get_roster(team_abbr: str):
    abbr = team_abbr.upper()
    async def fetch_roster():
        client = get_http_client()
        url = f"https://api-web.nhle.com/v1/roster/{abbr}/current"
        res = await client.get(url)
        if res.status_code != 200:
            if res.status_code == 429:
                raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
            raise HTTPException(status_code=404, detail="Roster not found.")
        return fix_double_encoding(res.json())

    return await cache.get_or_set(f"roster_{abbr}", fetch_roster, ttl=3600)


@app.get("/player/{player_id}")
async def get_player(player_id: str):
    pid = str(player_id)
    async def fetch_player():
        client = get_http_client()
        url = f"https://api-web.nhle.com/v1/player/{pid}/landing"
        res = await client.get(url)
        if res.status_code != 200:
            if res.status_code == 429:
                raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
            raise HTTPException(status_code=404, detail="Player not found.")
        return fix_double_encoding(res.json())

    return await cache.get_or_set(f"player_{pid}", fetch_player, ttl=3600)


@app.get("/standings/now")
async def get_standings_now():
    async def fetch_standings():
        client = get_http_client()
        url = "https://api-web.nhle.com/v1/standings/now"
        res = await client.get(url)
        if res.status_code != 200:
            if res.status_code == 429:
                raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
            raise HTTPException(status_code=404, detail="Standings not found.")
        data = fix_double_encoding(res.json())
        for s in data.get("standings", []):
            abbr = s.get("teamAbbrev", {}).get("default")
            if abbr:
                _cached_standings_pctg[abbr] = s.get("pointPctg", 0.5)
        return data

    return await cache.get_or_set("standings_now", fetch_standings, ttl=300)


@app.get("/standings/{date}")
async def get_standings_date(date: str):
    async def fetch_standings_date():
        client = get_http_client()
        url = f"https://api-web.nhle.com/v1/standings/{date}"
        res = await client.get(url)
        if res.status_code != 200:
            if res.status_code == 429:
                raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
            raise HTTPException(status_code=404, detail="Standings not found.")
        return fix_double_encoding(res.json())

    return await cache.get_or_set(f"standings_{date}", fetch_standings_date, ttl=86400)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
