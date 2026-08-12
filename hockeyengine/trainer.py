import pandas as pd
import numpy as np
import argparse
from sklearn.model_selection import train_test_split
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, brier_score_loss
import joblib

def train_model(input_file):
    print(f"Loading data from {input_file}...")
    df = pd.read_csv(input_file)
    
    df = df.dropna(subset=['x', 'y', 'is_goal'])

    # 1. Spatial Feature Engineering
    df['dx'] = 89 - df['x'].abs()
    df['dy'] = df['y']
    df['distance'] = np.sqrt(df['dx']**2 + df['dy']**2)
    df['angle'] = np.arctan(df['dy'].abs() / (df['dx'] + 1e-5)) * (180 / np.pi)

    # 2. Strength State Engineering (5v5 vs Powerplay)
    # situation_code format: AwayGoalie, AwaySkaters, HomeSkaters, HomeGoalie
    # We simplify this to a boolean: Is it 5v5?
    df['is_5v5'] = df['situation_code'].astype(str).apply(lambda x: 1 if x[1:3] == '55' else 0)

    # Clean up shot_type for the model
    df['shot_type'] = df['shot_type'].fillna('unknown').astype('category')

    # 3. Prepare Features (X) and Target (y)
    features = ['distance', 'angle', 'is_rebound', 'is_rush', 'crossed_royal_road', 'is_5v5', 'shot_type']
    X = df[features]
    y = df['is_goal']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    # 4. Train the Model using HistGradientBoosting
    # This natively handles categorical columns without needing a StandardScaler or OneHotEncoder
    model = HistGradientBoostingClassifier(
        categorical_features=['shot_type'],
        max_iter=200,
        learning_rate=0.05,
        random_state=42
    )
    model.fit(X_train, y_train)

    # 5. Evaluate Performance
    y_pred_probs = model.predict_proba(X_test)[:, 1]

    auc_score = roc_auc_score(y_test, y_pred_probs)
    brier_score = brier_score_loss(y_test, y_pred_probs)

    print("--- Model Training Complete ---")
    print(f"ROC-AUC Score: {auc_score:.4f} (Good models sit around 0.76 - 0.80)")
    print(f"Brier Score:   {brier_score:.4f}")

    # 6. Export the artifact
    joblib.dump(model, 'xg_model_gb.pkl')
    print("Artifact saved: 'xg_model_gb.pkl'")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train an Expected Goals model.")
    parser.add_argument('-i', '--input', type=str, required=True)
    args = parser.parse_args()
    train_model(args.input)