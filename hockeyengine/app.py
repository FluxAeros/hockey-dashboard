import os
import traceback
from pathlib import Path
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

import httpx
import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, HTTPException, Depends, Header
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
    save_cached_game
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
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

        if event_type in ['shot-on-goal', 'missed-shot', 'goal']:
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


# ==========================================
# Auth Schemas & Dependencies
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

    user = create_user(req.username, req.email, req.password)
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

    token = create_access_token(user.id, user.username)
    return {
        "token": token,
        "user": user.to_dict()
    }


@app.get("/auth/me")
def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": user}


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


@app.get("/game/{game_id}")
async def get_live_game_xg(game_id: str):
    gid = str(game_id)

    # 1. Check persistent SQLite cache for completed games
    persistent_cached = get_cached_game(f"xg_{gid}")
    if persistent_cached:
        return persistent_cached

    # 2. Use in-memory cache with request coalescing
    async def fetch_and_compute_xg():
        client = get_http_client()
        url = f"https://api-web.nhle.com/v1/gamecenter/{gid}/play-by-play"
        res = await client.get(url)
        if res.status_code != 200:
            return fix_double_encoding({
                "shots": [],
                "winProbability": None,
                "gameState": "FUT"
            })

        raw_json = res.json()
        game_state = raw_json.get("gameState", "FUT")
        plays = raw_json.get('plays', [])
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

        # Win probability calculation
        win_probability = None
        try:
            home_team_id = raw_json.get('homeTeam', {}).get('id')
            away_team_id = raw_json.get('awayTeam', {}).get('id')
            
            home_goals = sum(1 for s in processed_shots if s.get('is_goal') == 1 and s.get('team_id') == home_team_id)
            away_goals = sum(1 for s in processed_shots if s.get('is_goal') == 1 and s.get('team_id') == away_team_id)
            home_xg = sum(s.get('xg', 0.0) for s in processed_shots if s.get('team_id') == home_team_id)
            away_xg = sum(s.get('xg', 0.0) for s in processed_shots if s.get('team_id') == away_team_id)
            home_shots = sum(1 for s in processed_shots if s.get('team_id') == home_team_id)
            away_shots = sum(1 for s in processed_shots if s.get('team_id') == away_team_id)
            
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
                features_input = np.array([[score_diff, seconds_remaining, min(period, 3), manpower_diff, xg_diff, shots_diff]])
                home_prob = float(win_prob_model.predict_proba(features_input)[0][1]) * 100
            else:
                logit = 0.14 + (score_diff * 1.35) + (xg_diff * 0.55) + (shots_diff * 0.05)
                home_prob = (1.0 / (1.0 + np.exp(-logit))) * 100
                
            home_prob = min(99.5, max(0.5, round(home_prob, 1)))
            away_prob = round(100.0 - home_prob, 1)
            
            win_probability = {
                "homeProb": home_prob,
                "awayProb": away_prob
            }
        except Exception:
            pass

        result = fix_double_encoding({
            "shots": processed_shots,
            "winProbability": win_probability,
            "gameState": game_state
        })

        if game_state in ["FINAL", "OFF"]:
            save_cached_game(f"xg_{gid}", game_state, result)

        return result

    return await cache.get_or_set(f"xg_{gid}", fetch_and_compute_xg, ttl=15)


@app.get("/game/{game_id}/win-prob")
async def get_game_win_prob(game_id: str):
    data = await get_live_game_xg(game_id)
    return data.get("winProbability", {})


@app.get("/schedule/{date}")
async def get_schedule(date: str):
    async def fetch_schedule():
        client = get_http_client()
        url = f"https://api-web.nhle.com/v1/schedule/{date}"
        res = await client.get(url)
        if res.status_code != 200:
            return fix_double_encoding({
                "games": [],
                "gameWeek": [],
                "nextStartDate": None,
                "previousStartDate": None
            })
        data = res.json()
        game_week = data.get('gameWeek', [])
        day = next((d for d in game_week if d.get('date') == date), None)
        return fix_double_encoding({
            "games": day.get('games', []) if day else [],
            "gameWeek": game_week,
            "nextStartDate": data.get("nextStartDate"),
            "previousStartDate": data.get("previousStartDate")
        })

    return await cache.get_or_set(f"schedule_{date}", fetch_schedule, ttl=120)


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
    if persistent_cached:
        return persistent_cached

    async def fetch_boxscore():
        client = get_http_client()
        url = f"https://api-web.nhle.com/v1/gamecenter/{gid}/boxscore"
        res = await client.get(url)
        if res.status_code != 200:
            raise HTTPException(status_code=404, detail="Boxscore not found.")
        data = fix_double_encoding(res.json())
        game_state = data.get("gameState")
        if game_state in ["FINAL", "OFF"]:
            save_cached_game(f"box_{gid}", game_state, data)
        return data

    return await cache.get_or_set(f"box_{gid}", fetch_boxscore, ttl=15)


@app.get("/matchups/{game_id}")
async def get_matchups(game_id: str):
    gid = str(game_id)

    persistent_cached = get_cached_game(f"matchups_{gid}")
    if persistent_cached:
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

        if game_state in ["FINAL", "OFF"]:
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
        return fix_double_encoding(res.json())

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
