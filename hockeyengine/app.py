from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pandas as pd
import numpy as np
import requests
import joblib


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

app = FastAPI(title="NHL Live Expected Goals Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SHOT_TYPE_CATEGORIES = ['backhand', 'deflected', 'slap', 'snap', 'tip-in', 'wrap-around', 'wrist', 'unknown']

# Load the advanced gradient boosting model
# Note: Ensure you have your trained 'xg_model_gb.pkl' file in the directory
try:
    model = joblib.load('xg_model_gb.pkl')
except:
    print("Warning: xg_model_gb.pkl not found. Please train your model first.")
    model = None

def time_to_seconds(time_str):
    if not time_str: return 0
    parts = time_str.split(':')
    return int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 0

def process_game_plays(plays):
    """Processes raw play-by-play data into feature sets."""
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
                    'team_desc': play.get('details', {}).get('typeDescKey', '') # team identity info
                })

        last_event_time = current_time_sec
        last_event_period = period
        last_event_team = current_team
        last_event_type = event_type
        if details.get('yCoord') is not None and details.get('xCoord') is not None:
            last_event_x = details.get('xCoord')
            last_event_y = details.get('yCoord')
            
    return shot_events

@app.get("/game/{game_id}")
def get_live_game_xg(game_id: str):
    import traceback

    if not model:
        raise HTTPException(status_code=500, detail="Model artifact not loaded on server.")
        
    url = f"https://api-web.nhle.com/v1/gamecenter/{game_id}/play-by-play"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="Game not found or NHL API unreachable.")
    
    try:
        plays = response.json().get('plays', [])
        processed_shots = process_game_plays(plays)
        
        if not processed_shots:
            return {"shots": []}
            
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
            
        return fix_double_encoding({"shots": processed_shots})

    except Exception as e:
        tb = traceback.format_exc()
        print("=== /game ERROR ===")
        print(tb)
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")

@app.get("/schedule/{date}")
def get_schedule(date: str):
    url = f"https://api-web.nhle.com/v1/schedule/{date}"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail=f"NHL API returned {response.status_code}")
    data = response.json()
    game_week = data.get('gameWeek', [])
    day = next((d for d in game_week if d.get('date') == date), None)
    return fix_double_encoding({
        "games": day.get('games', []) if day else [],
        "gameWeek": game_week,
        "nextStartDate": data.get("nextStartDate"),
        "previousStartDate": data.get("previousStartDate")
    })

@app.get("/boxscore/{game_id}")
def get_boxscore(game_id: str):
    url = f"https://api-web.nhle.com/v1/gamecenter/{game_id}/boxscore"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        raise HTTPException(status_code=404, detail="Boxscore not found.")
    return fix_double_encoding(response.json())

@app.get("/matchups/{game_id}")
def get_matchups(game_id: str):
    import requests
    
    # 1. Fetch the boxscore to map every player to an 'F' or 'D'
    boxscore_url = f"https://api-web.nhle.com/v1/gamecenter/{game_id}/boxscore"
    box_response = requests.get(boxscore_url, headers={'User-Agent': 'Mozilla/5.0'})
    box_response.encoding = "utf-8"
    
    player_positions = {}
    if box_response.status_code == 200:
        box_data = box_response.json()
        stats = box_data.get('playerByGameStats', {})
        for team_key in ['awayTeam', 'homeTeam']:
            team_stats = stats.get(team_key, {})
            for f in team_stats.get('forwards', []):
                if 'playerId' in f:
                    player_positions[f['playerId']] = 'F'
            for d in team_stats.get('defense', []):
                if 'playerId' in d:
                    player_positions[d['playerId']] = 'D'

    # 2. Fetch the shift charts
    url = f"https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId={game_id}"
    response = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'})
    response.encoding = "utf-8"
    
    if response.status_code != 200:
        return {}
        
    data = response.json().get('data', [])
    
    def to_absolute_seconds(period, time_str):
        if not time_str: return 0
        m, s = map(int, time_str.split(':'))
        return (period - 1) * 1200 + m * 60 + s

    shifts = []
    teams = set()
    
    for d in data:
        player_id = d.get('playerId')
        pos = player_positions.get(player_id)
        
        if not pos: continue
            
        if not d.get('startTime') or not d.get('endTime'): continue
        start = to_absolute_seconds(d['period'], d['startTime'])
        end = to_absolute_seconds(d['period'], d['endTime'])
        if end <= start: continue 

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

    # 3. Calculate all overlapping combinations using IDs
    overlaps = {} 
    for s1 in t1_shifts:
        for s2 in t2_shifts:
            if s1['pos'] != s2['pos']: continue
                
            overlap_start = max(s1['start'], s2['start'])
            overlap_end = min(s1['end'], s2['end'])
            duration = overlap_end - overlap_start
            
            if duration > 0:
                # Key is now a tuple of (id1, name1, id2, name2)
                key = (s1['id'], s1['name'], s2['id'], s2['name'])
                overlaps[key] = overlaps.get(key, 0) + duration

    # 4. Group matchups by player ID
    t1_matchups = {}
    t2_matchups = {}
    
    for (id1, n1, id2, n2), secs in overlaps.items():
        if secs < 60: continue 
        
        if id1 not in t1_matchups: t1_matchups[id1] = {"name": n1, "opponents": []}
        t1_matchups[id1]["opponents"].append({"id": id2, "name": n2, "overlap_seconds": secs})
        
        if id2 not in t2_matchups: t2_matchups[id2] = {"name": n2, "opponents": []}
        t2_matchups[id2]["opponents"].append({"id": id1, "name": n1, "overlap_seconds": secs})
        
    player_positions_by_id = {s['id']: s['pos'] for s in shifts}

    # Helper to sort and slice opponents based on player position
    def build_player_list(matchup_dict):
        players = []
        for p_id, p_data in matchup_dict.items():
            pos = player_positions_by_id.get(p_id, "F")
            
            # Sort the opponents by time on ice
            p_data["opponents"].sort(key=lambda x: x['overlap_seconds'], reverse=True)
            
            # Dynamically set the slice limit: 3 for Forwards, 2 for Defensemen
            limit = 3 if pos == 'F' else 2
            
            players.append({
                "id": p_id,
                "name": p_data["name"],
                "position": pos,
                "opponents": p_data["opponents"][:limit]
            })
            
        players.sort(key=lambda x: x['opponents'][0]['overlap_seconds'] if x['opponents'] else 0, reverse=True)
        return players

    return fix_double_encoding({
        "team1": {"id": t1_id, "players": build_player_list(t1_matchups)},
        "team2": {"id": t2_id, "players": build_player_list(t2_matchups)}
    })

@app.get("/schedule-week/now")
def get_schedule_week():
    url = "https://api-web.nhle.com/v1/schedule/now"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        raise HTTPException(status_code=response.status_code, detail="Schedule not found.")
    return fix_double_encoding(response.json())

@app.get("/roster/{team_abbr}")
def get_roster(team_abbr: str):
    url = f"https://api-web.nhle.com/v1/roster/{team_abbr}/current"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
        raise HTTPException(status_code=404, detail="Roster not found.")
    return fix_double_encoding(response.json())

@app.get("/player/{player_id}")
def get_player(player_id: str):
    url = f"https://api-web.nhle.com/v1/player/{player_id}/landing"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
        raise HTTPException(status_code=404, detail="Player not found.")
    return fix_double_encoding(response.json())

@app.get("/standings/now")
def get_standings_now():
    url = "https://api-web.nhle.com/v1/standings/now"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
        raise HTTPException(status_code=404, detail="Standings not found.")
    return fix_double_encoding(response.json())

@app.get("/standings/{date}")
def get_standings_date(date: str):
    url = f"https://api-web.nhle.com/v1/standings/{date}"
    headers = {'User-Agent': 'Mozilla/5.0'}
    response = requests.get(url, headers=headers)
    response.encoding = "utf-8"
    if response.status_code != 200:
        if response.status_code == 429:
            raise HTTPException(status_code=429, detail="NHL API rate limit exceeded.")
        raise HTTPException(status_code=404, detail="Standings not found.")
    return fix_double_encoding(response.json())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
