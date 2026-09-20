from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from sklearn.kernel_ridge import KernelRidge
from sklearn.manifold import TSNE
from src.config import config

PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"
OUTPUT_COORDS_CSV = config["project_root"] / "datasets" / "cowen_2d_coords.csv"
OUTPUT_MODEL_PATH = config["project_root"] / "src" / "models" / "projector" / "mood_projector_kr.joblib"

# The 24 retained high-signal dimensions
EMOTION_COLS = [
    "amusing",
    "angry",
    "annoying",
    "anxious/tense",
    "awe-inspiring/amazing",
    "beautiful",
    "bittersweet",
    "calm/relaxing/serene",
    "compassionate/sympathetic",
    "dreamy",
    "eerie/mysterious",
    "energizing/pump-up",
    "erotic/desirous",
    "euphoric/ecstatic",
    "exciting",
    "indignant/defiant",
    "joyful/cheerful",
    "proud/strong",
    "romantic/loving",
    "sad/depressing",
    "scary/fearful",
    "tender/longing",
    "transcendent/mystical",
    "triumphant/heroic",
]

# As per the Cowen paper, only 13 emotions are truly orthogonal
CORE_EMOTIONS = [
    "amusing",
    "angry",
    "annoying",
    "anxious/tense",
    "beautiful",
    "calm/relaxing/serene",
    "dreamy",
    "energizing/pump-up",
    "erotic/desirous",
    "indignant/defiant",
    "joyful/cheerful",
    "sad/depressing",
    "scary/fearful",
]

def load_and_project() -> pd.DataFrame:
    print(f"Reading {PARQUET_PATH}...")
    df = pd.read_parquet(PARQUET_PATH)
    df["row_id"] = np.arange(1, len(df) + 1)

    def get_audio_filename(entry):
        if isinstance(entry, dict) and entry.get("path"):
            return Path(entry["path"]).name
        return ""

    df["filename"] = df["audio"].apply(get_audio_filename)
    df["audio_rel_url"] = "audio_cache/" + df["filename"]

    X = df[EMOTION_COLS].to_numpy(dtype=np.float64)

    print(f"Running t-SNE over {len(df)} samples across 24 emotions...")
    tsne = TSNE(
        n_components=2,
        metric="correlation",
        perplexity=50,
        learning_rate=500.0,
        max_iter=3000,
        random_state=42,
    )
    coords = tsne.fit_transform(X)

    df["map_x"] = coords[:, 0]
    df["map_y"] = coords[:, 1]
    
    X_13 = df[CORE_EMOTIONS].to_numpy(dtype=np.float64)
    df["dominant_emotion"] = [CORE_EMOTIONS[i] for i in np.argmax(X_13, axis=1)]

    print("Fitting Kernel Ridge Regression mapper (24D -> 2D)...")
    kr = KernelRidge(kernel="rbf", alpha=0.1, gamma=1.0)
    kr.fit(X, coords)

    OUTPUT_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": kr, "emotion_cols": EMOTION_COLS}, OUTPUT_MODEL_PATH)
    print(f"Saved fitted 2D projector to {OUTPUT_MODEL_PATH}")

    export_cols = ["row_id", "filename", "map_x", "map_y", "dominant_emotion"] + EMOTION_COLS
    df[export_cols].to_csv(OUTPUT_COORDS_CSV, index=False)
    print(f"Saved coordinate table to {OUTPUT_COORDS_CSV}")

    return df


if __name__ == "__main__":
    load_and_project()
