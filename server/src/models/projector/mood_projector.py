from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union
import joblib
import numpy as np
import pandas as pd
from sklearn.neighbors import NearestNeighbors
from src.config import config


class MoodProjector:
    """Projects 24-dimensional Cowen emotional scores into 2D manifold coordinates.

    Supports Kernel Ridge Regression ('kr') and KNN manifold interpolation ('knn').
    Applies empirical threshold masking on normalized scores (>= 0.35) while preserving
    unnormalized amplitude dynamics.
    """

    THRESHOLD = 0.35

    def __init__(self, method: str = "kr", k: int = 5):
        self.method = method.lower()
        self.k = k
        self.emotion_cols: List[str] = []
        self._project_fn = None

        self._setup_model()

    def _get_projector_path(self) -> Path:
        return (
            config["project_root"]
            / "src"
            / "models"
            / "projector"
            / "mood_projector_kr.joblib"
        )

    def _get_cowen_coords_path(self) -> Path:
        return config["project_root"] / "datasets" / "cowen_2d_coords.csv"

    def _setup_model(self) -> None:
        if self.method == "knn":
            cowen_coords_path = self._get_cowen_coords_path()
            if not cowen_coords_path.exists():
                raise FileNotFoundError(
                    f"Cowen reference coordinates not found at: {cowen_coords_path}."
                )

            cowen_df = pd.read_csv(cowen_coords_path)
            metadata_cols = {"row_id", "filename", "map_x", "map_y", "dominant_emotion"}
            self.emotion_cols = [c for c in cowen_df.columns if c not in metadata_cols]

            X_ref = cowen_df[self.emotion_cols].to_numpy(dtype=np.float64)
            Y_ref = cowen_df[["map_x", "map_y"]].to_numpy(dtype=np.float64)

            knn = NearestNeighbors(n_neighbors=self.k, metric="correlation")
            knn.fit(X_ref)

            def project_coords(X_input: np.ndarray) -> np.ndarray:
                distances, indices = knn.kneighbors(X_input)
                weights = 1.0 / (distances + 1e-6)
                weights /= np.sum(weights, axis=1, keepdims=True)
                return np.sum(Y_ref[indices] * weights[:, :, np.newaxis], axis=1)

            self._project_fn = project_coords

        else:
            # Default: Kernel Ridge ('kr')
            model_path = self._get_projector_path()
            if not model_path.exists():
                raise FileNotFoundError(f"Projector model not found at: {model_path}.")

            checkpoint = joblib.load(model_path)
            kr_model = checkpoint["model"]
            self.emotion_cols = checkpoint["emotion_cols"]

            self._project_fn = lambda X_input: kr_model.predict(X_input)

    def _prepare_sparse_vector(
        self,
        emotions: Dict[str, float],
        emotions_normalized: Optional[Dict[str, float]] = None,
    ) -> np.ndarray:
        """Applies 0.35 normalized thresholding to filter unnormalized emotion scores."""
        norm_dict = emotions_normalized or {}

        raw_vals = np.array(
            [float(emotions.get(col, 0.0)) for col in self.emotion_cols],
            dtype=np.float64,
        )
        norm_vals = np.array(
            [float(norm_dict.get(col, 0.0)) for col in self.emotion_cols],
            dtype=np.float64,
        )

        sparse_raw = np.where(norm_vals >= self.THRESHOLD, raw_vals, 0.0)

        # Fallback: if all filtered out, retain the dominant peak
        if np.all(sparse_raw == 0.0):
            top_idx = (
                int(np.argmax(norm_vals))
                if len(norm_dict) > 0
                else int(np.argmax(raw_vals))
            )
            sparse_raw[top_idx] = raw_vals[top_idx]

        return sparse_raw

    def project_track(
        self,
        emotions: Dict[str, float],
        emotions_normalized: Optional[Dict[str, float]] = None,
    ) -> Tuple[float, float]:
        """Projects a single track's emotions into 2D coordinates (coord_x, coord_y).

        Args:
            emotions: Raw unnormalized emotion dict.
            emotions_normalized: Calibrated [0.0, 1.0] normalized emotion dict.

        Returns:
            Tuple of (coord_x, coord_y) as floats.
        """
        sparse_vector = self._prepare_sparse_vector(emotions, emotions_normalized)
        X = np.expand_dims(sparse_vector, axis=0)
        coords = self._project_fn(X)[0]
        return float(coords[0]), float(coords[1])

    def project_batch(
        self, records: List[Tuple[Dict[str, float], Optional[Dict[str, float]]]]
    ) -> List[Tuple[float, float]]:
        """Projects a batch of emotion pairs efficiently."""
        if not records:
            return []

        sparse_matrix = np.array(
            [self._prepare_sparse_vector(raw, norm) for raw, norm in records],
            dtype=np.float64,
        )
        coords_batch = self._project_fn(sparse_matrix)
        return [(float(x), float(y)) for x, y in coords_batch]


# Singleton instance helper for the server
_projector_instance: Optional[MoodProjector] = None


def get_mood_projector(method: str = "kr", k: int = 5) -> MoodProjector:
    """Returns a singleton instance of the MoodProjector."""
    global _projector_instance
    if _projector_instance is None:
        _projector_instance = MoodProjector(method=method, k=k)
    return _projector_instance
