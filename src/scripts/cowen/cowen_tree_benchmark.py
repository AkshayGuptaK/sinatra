from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict


def run_tree_benchmark():
    csv_path = Path("datasets/cowen.csv")
    ridge_path = Path("datasets/cowen_regression_weights.csv")
    output_path = Path("datasets/cowen_tree_results.csv")

    if not csv_path.exists():
        print(f"File not found: {csv_path}")
        return

    df = pd.read_csv(csv_path)

    # 1. Separate target mood dimensions and acoustic features
    all_cols = list(df.columns)
    split_idx = all_cols.index("vocal_probability")

    mood_cols = all_cols[:split_idx]
    feature_cols = all_cols[split_idx:]

    df_clean = df.dropna(subset=feature_cols + mood_cols).copy()
    X = df_clean[feature_cols].values

    # Load previous linear Ridge scores for direct side-by-side comparison
    ridge_r2_map = {}
    if ridge_path.exists():
        ridge_df = pd.read_csv(ridge_path)
        ridge_r2_map = dict(zip(ridge_df["mood"], ridge_df["r2"]))

    # Identical 5-fold split to match the linear benchmark
    cv = KFold(n_splits=5, shuffle=True, random_state=42)

    results = []

    print(f"Loaded {len(df_clean)} samples.")
    print("\n" + "=" * 95)
    print(f"{'Mood Dimension':<26} | {'Ridge R²':<9} | {'Tree R²':<8} | {'Delta R²':<9} | Top Feature Drivers")
    print("=" * 95)

    for mood in mood_cols:
        y = df_clean[mood].values

        # Fast gradient boosting with regularization against small-dataset overfitting
        model = HistGradientBoostingRegressor(
            max_iter=100,
            max_leaf_nodes=31,
            min_samples_leaf=20,
            l2_regularization=1.0,
            random_state=42
        )

        # 5-fold out-of-fold cross-validated predictions
        y_pred = cross_val_predict(model, X, y, cv=cv)

        tree_r2 = r2_score(y, y_pred)
        tree_rmse = np.sqrt(mean_squared_error(y, y_pred))

        # Fit on full data to calculate permutation feature importance
        model.fit(X, y)
        perm = permutation_importance(
            model, X, y, n_repeats=5, random_state=42, scoring="r2"
        )
        importances = perm.importances_mean

        top_indices = np.argsort(importances)[-2:][::-1]
        top_drivers = ", ".join(
            [f"{feature_cols[idx]} ({importances[idx]:.3f})" for idx in top_indices]
        )

        ridge_r2 = ridge_r2_map.get(mood, np.nan)
        delta_r2 = tree_r2 - ridge_r2 if not np.isnan(ridge_r2) else np.nan

        ridge_str = f"{ridge_r2:+.4f}" if not np.isnan(ridge_r2) else "N/A"
        delta_str = f"{delta_r2:+.4f}" if not np.isnan(delta_r2) else "N/A"

        print(f"{mood:<26} | {ridge_str:<9} | {tree_r2:+.4f}  | {delta_str:<9} | {top_drivers}")

        record = {
            "mood": mood,
            "ridge_r2": ridge_r2,
            "tree_r2": tree_r2,
            "delta_r2": delta_r2,
            "tree_rmse": tree_rmse,
        }
        for col_name, imp in zip(feature_cols, importances):
            record[f"importance_{col_name}"] = imp

        results.append(record)

    out_df = pd.DataFrame(results)
    out_df.to_csv(output_path, index=False)
    print("=" * 95)
    print(f"Saved tree benchmark results to {output_path}")


if __name__ == "__main__":
    run_tree_benchmark()