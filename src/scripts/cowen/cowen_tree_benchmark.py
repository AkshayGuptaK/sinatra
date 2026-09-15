import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.inspection import permutation_importance
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.model_selection import KFold, cross_val_predict

# Dimensions dropped due to low cross-cultural stability or near-zero signal floor
DROPPED_EMOTIONS = {
    "entrancing",
    "goose bumps",
    "nauseating/revolting",
    "painful",
}


def _run_tree_experiment(
    csv_path: Path,
    ridge_weights_path: Path,
    output_path: Path,
    feature_start_col: str,
    label: str,
    max_leaf_nodes: int = 31,
    min_samples_leaf: int = 20,
    l2_reg: float = 1.0,
    calc_importances: bool = True,
) -> pd.DataFrame | None:
    if not csv_path.exists():
        print(f"❌ File not found: {csv_path}")
        return None

    df = pd.read_csv(csv_path)

    all_cols = list(df.columns)
    if feature_start_col not in all_cols:
        print(f"❌ Column '{feature_start_col}' not found in {csv_path}")
        return None

    split_idx = all_cols.index(feature_start_col)
    raw_mood_cols = all_cols[:split_idx]
    mood_cols = [m for m in raw_mood_cols if m not in DROPPED_EMOTIONS]
    feature_cols = all_cols[split_idx:]

    df_clean = df.dropna(subset=feature_cols + mood_cols).copy()
    X = df_clean[feature_cols].values

    ridge_r2_map = {}
    if ridge_weights_path.exists():
        ridge_df = pd.read_csv(ridge_weights_path)
        ridge_r2_map = dict(zip(ridge_df["mood"], ridge_df["r2"]))

    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    results = []

    print(f"\nRunning Tree Regressor [{label}] from {csv_path.name}")
    print(
        f"Samples: {len(df_clean)} | Retained Moods: {len(mood_cols)} (Dropped {len(DROPPED_EMOTIONS)}) | Features: {len(feature_cols)}"
    )
    print("=" * 95)
    print(
        f"{'Mood Dimension':<26} | {'Ridge R²':<9} | {'Tree R²':<8} | {'Delta R²':<9} | Top Drivers / Notes"
    )
    print("=" * 95)

    for mood in mood_cols:
        y = df_clean[mood].values

        model = HistGradientBoostingRegressor(
            max_iter=100,
            max_leaf_nodes=max_leaf_nodes,
            min_samples_leaf=min_samples_leaf,
            l2_regularization=l2_reg,
            random_state=42,
        )

        y_pred = cross_val_predict(model, X, y, cv=cv)
        tree_r2 = r2_score(y, y_pred)
        tree_rmse = np.sqrt(mean_squared_error(y, y_pred))

        drivers_str = ""
        importances = None
        if calc_importances:
            model.fit(X, y)
            perm = permutation_importance(
                model, X, y, n_repeats=3, random_state=42, scoring="r2"
            )
            importances = perm.importances_mean
            top_indices = np.argsort(importances)[-2:][::-1]
            drivers_str = ", ".join(
                [f"{feature_cols[idx]} ({importances[idx]:.3f})" for idx in top_indices]
            )

        ridge_r2 = ridge_r2_map.get(mood, np.nan)
        delta_r2 = tree_r2 - ridge_r2 if not np.isnan(ridge_r2) else np.nan

        ridge_str = f"{ridge_r2:+.4f}" if not np.isnan(ridge_r2) else "N/A"
        delta_str = f"{delta_r2:+.4f}" if not np.isnan(delta_r2) else "N/A"

        print(
            f"{mood:<26} | {ridge_str:<9} | {tree_r2:+.4f}  | {delta_str:<9} | {drivers_str}"
        )

        record = {
            "mood": mood,
            "ridge_r2": ridge_r2,
            "tree_r2": tree_r2,
            "delta_r2": delta_r2,
            "tree_rmse": tree_rmse,
        }
        if importances is not None:
            for col_name, imp in zip(feature_cols, importances):
                record[f"importance_{col_name}"] = imp

        results.append(record)

    out_df = pd.DataFrame(results)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(output_path, index=False)
    print("=" * 95)
    print(f"✅ Saved results ({len(out_df)} moods) to {output_path}")
    return out_df


def run_dsp_trees():
    return _run_tree_experiment(
        csv_path=Path("datasets/cowen.csv"),
        ridge_weights_path=Path("datasets/cowen_regression_weights.csv"),
        output_path=Path("datasets/cowen_tree_results.csv"),
        feature_start_col="vocal_probability",
        label="18 Handcrafted DSP Features",
        max_leaf_nodes=31,
        min_samples_leaf=20,
        l2_reg=1.0,
        calc_importances=True,
    )


def run_mert_trees():
    return _run_tree_experiment(
        csv_path=Path("datasets/cowen_mert_embeddings.csv"),
        ridge_weights_path=Path("datasets/cowen_mert_regression_weights.csv"),
        output_path=Path("datasets/cowen_mert_tree_results.csv"),
        feature_start_col="mert_0",
        label="1024 MERT Embeddings",
        max_leaf_nodes=15,
        min_samples_leaf=30,
        l2_reg=5.0,
        calc_importances=False,
    )


if __name__ == "__main__":
    arg = sys.argv[1].lower() if len(sys.argv) > 1 else "dsp"

    if arg == "mert":
        run_mert_trees()
    elif arg == "all":
        run_dsp_trees()
        run_mert_trees()
    else:
        run_dsp_trees()
