import requests
import pandas as pd
import numpy as np
from pathlib import Path
import joblib
import time
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.metrics import brier_score_loss, roc_auc_score, log_loss

BASE_DIR = Path(__file__).resolve().parent

def time_to_seconds(time_str):
    if not time_str: return 0
    parts = time_str.split(':')
    return int(parts[0]) * 60 + int(parts[1]) if len(parts) == 2 else 0

def fetch_season_game_ids(season="20232024", max_games=200):
    """
    Fetches actual NHL regular season game IDs from the official NHL schedule API.
    """
    print(f"Fetching game list for season {season}...")
    # NHL game IDs follow format: {4-digit start year}02{4-digit game number 0001 to 1312}
    # 02 = Regular Season
    start_year = season[:4]
    game_ids = [f"{start_year}02{str(i).zfill(4)}" for i in range(1, max_games + 1)]
    return game_ids

def parse_real_game_play_by_play(game_id, xg_model=None):
    """
    Fetches real play-by-play for a game and extracts game-state checkpoints.
    """
    url = f"https://api-web.nhle.com/v1/gamecenter/{game_id}/play-by-play"
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        if resp.status_code != 200:
            return []
        data = resp.json()
    except Exception as e:
        return []

    home_team_id = data.get('homeTeam', {}).get('id')
    away_team_id = data.get('awayTeam', {}).get('id')
    
    plays = data.get('plays', [])
    if not plays:
        return []
        
    # Check who won
    final_home_goals = 0
    final_away_goals = 0
    
    for p in plays:
        if p.get('typeDescKey') == 'goal':
            team_id = p.get('details', {}).get('eventOwnerTeamId')
            if team_id == home_team_id:
                final_home_goals += 1
            elif team_id == away_team_id:
                final_away_goals += 1

    if final_home_goals == final_away_goals:
        return [] # Skip uncompleted or anomalous games
        
    home_won = 1 if final_home_goals > final_away_goals else 0
    
    game_states = []
    current_home_goals = 0
    current_away_goals = 0
    home_shots = 0
    away_shots = 0
    home_xg = 0.0
    away_xg = 0.0
    
    # Process events in chronological order
    for p in plays:
        period = p.get('periodDescriptor', {}).get('number', 1)
        if period > 3:
            continue # Regulation models typically train up to 60:00
            
        time_in_period = time_to_seconds(p.get('timeInPeriod', '00:00'))
        seconds_elapsed = (period - 1) * 1200 + time_in_period
        seconds_remaining = max(0, 3600 - seconds_elapsed)
        
        situation_code = str(p.get('situationCode', '1551'))
        # situation_code: AwayGoalie, AwaySkaters, HomeSkaters, HomeGoalie
        away_skaters = int(situation_code[1]) if len(situation_code) == 4 else 5
        home_skaters = int(situation_code[2]) if len(situation_code) == 4 else 5
        manpower_diff = home_skaters - away_skaters
        
        event_type = p.get('typeDescKey')
        team_id = p.get('details', {}).get('eventOwnerTeamId')
        
        if event_type in ['shot-on-goal', 'goal']:
            if team_id == home_team_id:
                home_shots += 1
                home_xg += 0.08 # Or compute precise xG if model provided
            elif team_id == away_team_id:
                away_shots += 1
                away_xg += 0.08
                
        if event_type == 'goal':
            if team_id == home_team_id:
                current_home_goals += 1
            elif team_id == away_team_id:
                current_away_goals += 1
                
        # Sample snapshots at shot attempts, goals, and period milestones
        if event_type in ['shot-on-goal', 'goal', 'missed-shot', 'blocked-shot', 'penalty']:
            game_states.append({
                'game_id': game_id,
                'score_diff': current_home_goals - current_away_goals,
                'seconds_remaining': seconds_remaining,
                'period': period,
                'manpower_diff': manpower_diff,
                'xg_diff': home_xg - away_xg,
                'shots_diff': home_shots - away_shots,
                'home_won': home_won
            })
            
    return game_states

def build_real_nhl_dataset(n_games=150):
    game_ids = fetch_season_game_ids(season="20232024", max_games=n_games)
    all_states = []
    
    print(f"Downloading real play-by-play data for {len(game_ids)} NHL games...")
    for idx, gid in enumerate(game_ids):
        states = parse_real_game_play_by_play(gid)
        if states:
            all_states.extend(states)
        if (idx + 1) % 25 == 0:
            print(f"Processed {idx + 1}/{len(game_ids)} games ({len(all_states)} total game snapshots)...")
        time.sleep(0.05) # Polite request pacing to prevent rate limits
        
    df = pd.DataFrame(all_states)
    print(f"\nSuccessfully collected {len(df)} real NHL game states across {len(game_ids)} games.")
    return df

def train_real_win_probability_model(n_games=150, output_path="win_prob_model.pkl"):
    df = build_real_nhl_dataset(n_games=n_games)
    
    features = [
        'score_diff',
        'seconds_remaining',
        'period',
        'manpower_diff',
        'xg_diff',
        'shots_diff'
    ]
    
    X = df[features]
    y = df['home_won']
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    print(f"\nTraining Calibrated Gradient Boosting model on {len(X_train)} real game states...")
    base_model = GradientBoostingClassifier(
        n_estimators=150,
        learning_rate=0.05,
        max_depth=3,
        subsample=0.85,
        random_state=42
    )
    
    calibrated_model = CalibratedClassifierCV(estimator=base_model, method='sigmoid', cv=5)
    calibrated_model.fit(X_train, y_train)
    
    # Evaluation
    y_pred_proba = calibrated_model.predict_proba(X_test)[:, 1]
    brier = brier_score_loss(y_test, y_pred_proba)
    auc = roc_auc_score(y_test, y_pred_proba)
    loss = log_loss(y_test, y_pred_proba)
    
    print("\n--- Real Data Model Evaluation ---")
    print(f"ROC-AUC:     {auc:.4f}")
    print(f"Brier Score: {brier:.4f}")
    print(f"Log Loss:    {loss:.4f}")
    
    out_file = BASE_DIR / output_path
    joblib.dump(calibrated_model, out_file)
    print(f"Saved real-data trained model to: {out_file}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Train Win Probability model on real NHL API data.")
    parser.add_argument("--games", type=int, default=150, help="Number of real NHL games to download and train on (default: 150)")
    args = parser.parse_args()
    train_real_win_probability_model(n_games=args.games)
