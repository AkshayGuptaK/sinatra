from pathlib import Path
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd
from src.config import config


class EmotionScorer:
    """Computes calibrated Cowen mood dimensions from 1024-dim MERT embeddings.

    Loads fitted Ridge regression weights/biases and establishes baseline empirical
    distribution anchors (1st and 99th percentiles) from the training corpus.
    Produces both a normalized [0.0, 1.0] dictionary for intuitive filtering
    and a raw continuous 24-dim vector for manifold vector distance queries.
    """

    def __init__(
        self,
        weights_path: Path | str | None = None,
        reference_corpus_path: Path | str | None = None,
    ):
        if weights_path is None:
            self.weights_path = (
                config["project_root"]
                / "datasets"
                / "cowen_mert_regression_weights.csv"
            )
        else:
            self.weights_path = Path(weights_path)

        if not self.weights_path.exists():
            raise FileNotFoundError(
                f"Mood weights not found at: {self.weights_path}. "
                "Run `uv run python -m src.scripts.cowen_regression mert` first."
            )

        if reference_corpus_path is None:
            self.ref_path = (
                config["project_root"] / "datasets" / "cowen_mert_embeddings.csv"
            )
        else:
            self.ref_path = Path(reference_corpus_path)

        print(f"Loading Cowen MoodScorer weights from: {self.weights_path}...")
        self.mood_names: List[str] = []
        self.weights: np.ndarray  # Shape: (1024, 24)
        self.biases: np.ndarray  # Shape: (24,)
        self._load_weights()

        # Calibration arrays for 0.0 - 1.0 normalization
        self.p_median: np.ndarray  # Shape: (24,)
        self.p_range: np.ndarray  # Shape: (24,)
        self._load_calibration_stats()

    def _load_weights(self) -> None:
        df = pd.read_csv(self.weights_path)
        self.mood_names = df["mood"].tolist()

        weight_cols = [f"w_mert_{i}" for i in range(1024)]
        missing_cols = [c for c in weight_cols if c not in df.columns]
        if missing_cols:
            raise ValueError(
                f"Corrupted weights file: missing {len(missing_cols)} weight columns."
            )

        # Transpose to shape (1024, N_MOODS) so we can compute: X @ W + b
        self.weights = df[weight_cols].values.T.astype(np.float32)
        self.biases = df["intercept"].values.astype(np.float32)

    def _load_calibration_stats(self) -> None:
        """Derives empirical 50th and 99th percentile bounds from the model's own
        predictions on the reference training embeddings.

        Because L2-regularized Ridge regression shrinks prediction variance
        relative to raw human survey ratings, normalizing incoming tracks
        against the model's actual dynamic output range (y_pred) spreads
        predicted scores cleanly across [0.0, 1.0] without compression.
        """
        if not self.ref_path.exists():
            self.p_median = np.zeros(len(self.mood_names), dtype=np.float32)
            self.p_range = np.ones(len(self.mood_names), dtype=np.float32)
            return

        ref_df = pd.read_csv(self.ref_path)
        feature_cols = [f"mert_{i}" for i in range(1024)]

        # Get reference embeddings: shape (N, 1024)
        X_train = ref_df[feature_cols].values.astype(np.float32)

        # Generate model predictions on reference corpus: shape (N, 24)
        y_train_pred = np.dot(X_train, self.weights) + self.biases

        # Calculate percentiles: p50 (noise floor) and p99 (archetype ceiling)
        p50 = np.percentile(y_train_pred, 50, axis=0)
        p99 = np.percentile(y_train_pred, 99, axis=0)

        self.p_median = p50.astype(np.float32)
        diff = p99 - p50
        self.p_range = np.where(diff > 1e-6, diff, 1.0).astype(np.float32)

    def score(
        self, embedding: np.ndarray | List[float]
        ) -> Tuple[Dict[str, float], List[float], Dict[str, float], List[float]]:
        """Projects a 1024-dimensional MERT embedding into mood space.

        Computes both raw continuous regression scores (y = x @ W + b) and
        calibrated scores normalized into [0.0, 1.0] using Median-Anchored
        Positive Scaling:
            - 0.0: Background noise floor (at or below the 50th percentile / median)
            - 1.0: Peak archetype expression (at or above the 99th percentile)

        Args:
            embedding: 1024-element vector (list or numpy array).

        Returns:
            A tuple of 4 items:
                1. raw_moods_dict: {mood_name: raw_score} (unnormalized floats)
                2. raw_mood_vector: raw continuous 24-dim vector as list[float]
                3. norm_moods_dict: {mood_name: norm_score} (calibrated to [0.0, 1.0])
                4. norm_mood_vector: normalized 24-dim vector as list[float]
        """
        x = np.asarray(embedding, dtype=np.float32)
        if x.ndim != 1 or x.shape[0] != 1024:
            raise ValueError(f"Expected 1024-dim embedding vector, got shape {x.shape}")

        # 1. Raw linear prediction: y = x @ W + b
        raw_scores = np.dot(x, self.weights) + self.biases
        raw_moods_dict: Dict[str, float] = {
            mood: round(float(val), 6) for mood, val in zip(self.mood_names, raw_scores)
        }
        raw_mood_vector = [float(v) for v in raw_scores]

        # 2. Median-Anchored Normalized prediction: [0.0, 1.0]
        # Any score at or below median (p50) clips to 0.0; scales linearly to p99 (1.0)
        norm_scores = np.clip((raw_scores - self.p_median) / self.p_range, 0.0, 1.0)
        norm_moods_dict: Dict[str, float] = {
            mood: round(float(val), 4)
            for mood, val in zip(self.mood_names, norm_scores)
        }
        norm_mood_vector = [round(float(v), 6) for v in norm_scores]

        return raw_moods_dict, raw_mood_vector, norm_moods_dict, norm_mood_vector

_scorer_instance: EmotionScorer | None = None


def get_emotion_scorer() -> EmotionScorer:
    global _scorer_instance
    if _scorer_instance is None:
        _scorer_instance = EmotionScorer()
    return _scorer_instance
