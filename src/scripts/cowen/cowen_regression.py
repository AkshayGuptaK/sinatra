from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.preprocessing import StandardScaler


def run_regression():
    csv_path = Path("datasets/cowen.csv")
    if not csv_path.exists():
        print(f"❌ File not found: {csv_path}")
        return

    df = pd.read_csv(csv_path)

    # 1. Separate target moods and acoustic features
    all_cols = list(df.columns)
    split_idx = all_cols.index("vocal_probability")

    mood_cols = all_cols[:split_idx]
    feature_cols = all_cols[split_idx:]

    print(f"Loaded {len(df)} tracks.")
    print(f"Found {len(mood_cols)} emotion dimensions and {len(feature_cols)} acoustic features.")

    # Drop any rows containing missing or corrupted entries
    df_clean = df.dropna(subset=feature_cols + mood_cols).copy()
    X = df_clean[feature_cols].values

    # Standardize acoustic features so coefficients can be directly compared
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    alphas = np.logspace(-2, 4, 30)

    summary_records = []

    print("\n" + "=" * 80)
    print(f"{'Mood Dimension':<28} | {'R²':<7} | {'RMSE':<7} | Top Positive & Negative Drivers")
    print("=" * 80)

    for mood in mood_cols:
        y = df_clean[mood].values

        # 5-fold cross-validated out-of-fold predictions
        model = RidgeCV(alphas=alphas)
        y_pred = cross_val_predict(model, X_scaled, y, cv=cv)

        r2 = r2_score(y, y_pred)
        rmse = np.sqrt(mean_squared_error(y, y_pred))

        # Fit on full data to inspect interpretability weights
        model.fit(X_scaled, y)
        coefs = model.coef_

        # Sort weights to find top positive and negative acoustic correlates
        sorted_indices = np.argsort(coefs)
        top_neg_idx = sorted_indices[:2]
        top_pos_idx = sorted_indices[-2:][::-1]

        pos_str = ", ".join([f"+{feature_cols[i]} ({coefs[i]:+.2f})" for i in top_pos_idx])
        neg_str = ", ".join([f"{feature_cols[i]} ({coefs[i]:+.2f})" for i in top_neg_idx])
        drivers_str = f"{pos_str} | {neg_str}"

        print(f"{mood:<28} | {r2:+.4f} | {rmse:.4f} | {drivers_str}")

        summary_records.append({
            "mood": mood,
            "r2": r2,
            "rmse": rmse,
            **{f"w_{col}": coef for col, coef in zip(feature_cols, coefs)},
            "intercept": model.intercept_
        })

    # Save fitted weights and intercept table for scoring personal library tracks
    results_df = pd.DataFrame(summary_records)
    results_path = Path("datasets/cowen_regression_weights.csv")
    results_df.to_csv(results_path, index=False)
    print("=" * 80)
    print(f"✅ Saved trained weights to {results_path}")


if __name__ == "__main__":
    run_regression()