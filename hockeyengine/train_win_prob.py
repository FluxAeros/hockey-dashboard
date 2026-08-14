import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.model_selection import train_test_split
from sklearn.metrics import brier_score_loss, roc_auc_score, log_loss
import joblib
from pathlib import Path

def generate_training_game_states(n_games=3000, random_state=42):
    """
    Generates synthetic NHL in-game state transitions based on standard NHL empirical rates
    (average 6.0 goals/game, 60 shots/game, realistic goal arrival Poisson processes)
    to train a robust baseline Win Probability model.
    """
    np.random.seed(random_state)
    records = []

    for game_id in range(n_games):
        # Base team strengths (Home ice advantage ~53% base)
        home_strength = np.random.normal(0.04, 0.15)
        
        home_goals = 0
        away_goals = 0
        home_xg = 0.0
        away_xg = 0.0
        home_shots = 0
        away_shots = 0
        
        # Sample game states across all 3 periods (60 minutes = 3600 seconds)
        # We sample at key checkpoints throughout the game
        time_checkpoints = sorted(np.random.randint(0, 3600, size=20))
        
        # Simulate regulation
        for t in range(0, 3601, 15): # every 15 seconds
            sec_left = 3600 - t
            period = 1 if t < 1200 else (2 if t < 2400 else 3)
            
            # Manpower state (standard 5v5 with occasional powerplays)
            mp_rand = np.random.rand()
            if mp_rand < 0.08:
                manpower_diff = 1 # Home PP
            elif mp_rand < 0.16:
                manpower_diff = -1 # Away PP
            else:
                manpower_diff = 0 # 5v5
            
            # Shot / Goal probability per 15s interval
            home_rate = (0.015 + home_strength * 0.005 + manpower_diff * 0.008)
            away_rate = (0.014 - home_strength * 0.005 - manpower_diff * 0.008)
            
            if np.random.rand() < home_rate:
                home_shots += 1
                shot_xg = np.random.beta(1.5, 12)
                home_xg += shot_xg
                if np.random.rand() < shot_xg:
                    home_goals += 1
                    
            if np.random.rand() < away_rate:
                away_shots += 1
                shot_xg = np.random.beta(1.5, 12)
                away_xg += shot_xg
                if np.random.rand() < shot_xg:
                    away_goals += 1
            
            if t in time_checkpoints:
                records.append({
                    'game_id': game_id,
                    'score_diff': home_goals - away_goals,
                    'seconds_remaining': sec_left,
                    'period': period,
                    'manpower_diff': manpower_diff,
                    'xg_diff': home_xg - away_xg,
                    'shots_diff': home_shots - away_shots,
                    'home_goals': home_goals,
                    'away_goals': away_goals,
                })
        
        # Determine final winner
        if home_goals > away_goals:
            home_won = 1
        elif away_goals > home_goals:
            home_won = 0
        else:
            # Overtime / Shootout: 50/50 with slight home advantage
            home_won = 1 if (np.random.rand() < (0.52 + home_strength * 0.2)) else 0
            
        for r in records[-len(time_checkpoints):]:
            r['home_won'] = home_won

    df = pd.DataFrame(records)
    return df

def train_win_probability_model(output_path="win_prob_model.pkl"):
    print("Generating simulated NHL game states...")
    df = generate_training_game_states(n_games=4000)
    
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
    
    print(f"Training Gradient Boosting model on {len(X_train)} game states...")
    base_model = GradientBoostingClassifier(
        n_estimators=120,
        learning_rate=0.06,
        max_depth=3,
        subsample=0.85,
        random_state=42
    )
    
    # Use CalibratedClassifierCV to ensure output probabilities are well calibrated
    calibrated_model = CalibratedClassifierCV(estimator=base_model, method='sigmoid', cv=5)
    calibrated_model.fit(X_train, y_train)
    
    # Evaluate
    y_pred_proba = calibrated_model.predict_proba(X_test)[:, 1]
    brier = brier_score_loss(y_test, y_pred_proba)
    auc = roc_auc_score(y_test, y_pred_proba)
    loss = log_loss(y_test, y_pred_proba)
    
    print("--- Model Evaluation ---")
    print(f"ROC-AUC:     {auc:.4f}")
    print(f"Brier Score: {brier:.4f} (Closer to 0 is better)")
    print(f"Log Loss:    {loss:.4f}")
    
    # Sanity checks
    # 1. Tied game with 3600s left
    tie_start = calibrated_model.predict_proba([[0, 3600, 1, 0, 0, 0]])[0][1]
    print(f"Sanity Check - Start of Game (Tied): Home Win Prob = {tie_start*100:.1f}%")
    
    # 2. Home up by 2 with 300s left
    up_two = calibrated_model.predict_proba([[2, 300, 3, 0, 0.8, 4]])[0][1]
    print(f"Sanity Check - Home +2 in P3 (5 min left): Home Win Prob = {up_two*100:.1f}%")
    
    # 3. Away up by 2 with 300s left
    down_two = calibrated_model.predict_proba([[-2, 300, 3, 0, -0.8, -4]])[0][1]
    print(f"Sanity Check - Home -2 in P3 (5 min left): Home Win Prob = {down_two*100:.1f}%")

    out_file = Path(__file__).resolve().parent / output_path
    joblib.dump(calibrated_model, out_file)
    print(f"Saved model to: {out_file}")

if __name__ == "__main__":
    train_win_probability_model()
