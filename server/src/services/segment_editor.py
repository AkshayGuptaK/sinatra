# server/src/services/segment_editor.py
from typing import Any, Literal
import numpy as np
import torch

from src.models.mert import get_mert_embedder
from src.services.emotion_scorer import get_emotion_scorer
from src.pg import get_pg
from src.sources import FileSystemSource

MIN_CHUNK_DURATION = 10.0  # Minimum allowable segment span in seconds


def _extract_chunk_features(
    waveform_slice: np.ndarray, sr: int = 24000
) -> dict[str, Any]:
    """Passes a raw waveform slice through MERT-v2 and MoodScorer."""
    embedder = get_mert_embedder()
    scorer = get_emotion_scorer()

    chunk = embedder.extract([{"waveform": waveform_slice}])[0]
    musical_vector = chunk["acoustic_embedding"]

    emotions, emotion_vec, emotions_norm, emotion_norm_vec = scorer.score(
        musical_vector
    )

    return {
        "musical_embedding": musical_vector,
        "emotions": emotions,
        "emotion_vector": emotion_vec,
        "emotions_normalized": emotions_norm,
        "emotion_vector_normalized": emotion_norm_vec,
    }


def edit_track_segments(
    track_id: str,
    action: Literal["split", "push", "pull"],
    timestamp: float,
) -> list[dict[str, Any]]:
    """Edits track segment boundaries at the specified playback timestamp and recalculates

    embeddings and emotions for modified segments.
    """
    db = get_pg()
    filepath = db.get_track_path_by_id(track_id)
    if not filepath:
        raise ValueError(f"Track with ID {track_id} not found.")

    chunks = db.get_track_segments(track_id)
    if not chunks:
        raise ValueError(f"No existing segments found for track {track_id}.")

    # Locate which segment currently contains the given timestamp
    target_idx = None
    for idx, c in enumerate(chunks):
        if c["start_sec"] <= timestamp < c["end_sec"]:
            target_idx = idx
            break

    if target_idx is None:
        raise ValueError(
            f"Timestamp {timestamp:.2f}s is outside active track segments."
        )

    target_chunk = chunks[target_idx]

    # Load audio into memory once for all slice re-encodings
    sr = 24000
    waveform = FileSystemSource.read_file(filepath, target_sr=sr, channels=1)
    if waveform is None:
        raise RuntimeError(f"Failed to decode audio file: {filepath}")
    

    if isinstance(waveform, torch.Tensor):
        waveform = waveform.detach().cpu().numpy()
    waveform = waveform.flatten()
    

    def get_slice(start_s: float, end_s: float) -> np.ndarray:
        s_idx = max(0, int(start_s * sr))
        e_idx = min(len(waveform), int(end_s * sr))
        return waveform[s_idx:e_idx]

    # --- ACTION: SPLIT ---
    if action == "split":
        chunk_a_start = target_chunk["start_sec"]
        chunk_a_end = timestamp
        chunk_b_start = timestamp
        chunk_b_end = target_chunk["end_sec"]

        if (chunk_a_end - chunk_a_start) < MIN_CHUNK_DURATION:
            raise ValueError(
                f"Split point too close to segment start (< {MIN_CHUNK_DURATION}s)."
            )
        if (chunk_b_end - chunk_b_start) < MIN_CHUNK_DURATION:
            raise ValueError(
                f"Split point too close to segment end (< {MIN_CHUNK_DURATION}s)."
            )

        feat_a = _extract_chunk_features(get_slice(chunk_a_start, chunk_a_end), sr=sr)
        feat_b = _extract_chunk_features(get_slice(chunk_b_start, chunk_b_end), sr=sr)

        db.split_chunk(
            track_id=track_id,
            chunk_a_id=target_chunk["id"],
            chunk_a_end=chunk_a_end,
            chunk_a_features=feat_a,
            chunk_b_start=chunk_b_start,
            chunk_b_end=chunk_b_end,
            chunk_b_features=feat_b,
        )

    # --- ACTION: PUSH (Move previous boundary forward to timestamp) ---
    elif action == "push":
        if target_idx == 0:
            raise ValueError("Cannot push split: current segment is the first segment.")

        prev_chunk = chunks[target_idx - 1]
        prev_start = prev_chunk["start_sec"]
        prev_end = timestamp
        cur_start = timestamp
        cur_end = target_chunk["end_sec"]

        if (prev_end - prev_start) < MIN_CHUNK_DURATION:
            raise ValueError(
                f"Push would make previous segment too short (< {MIN_CHUNK_DURATION}s)."
            )
        if (cur_end - cur_start) < MIN_CHUNK_DURATION:
            raise ValueError(
                f"Push would make current segment too short (< {MIN_CHUNK_DURATION}s)."
            )

        feat_prev = _extract_chunk_features(get_slice(prev_start, prev_end), sr=sr)
        feat_cur = _extract_chunk_features(get_slice(cur_start, cur_end), sr=sr)

        db.update_two_adjacent_chunks(
            chunk_a_id=prev_chunk["id"],
            chunk_a_new_end=prev_end,
            chunk_a_features=feat_prev,
            chunk_b_id=target_chunk["id"],
            chunk_b_new_start=cur_start,
            chunk_b_features=feat_cur,
        )

    # --- ACTION: PULL (Move next boundary backward to timestamp) ---
    elif action == "pull":
        if target_idx >= len(chunks) - 1:
            raise ValueError("Cannot pull split: current segment is the last segment.")

        next_chunk = chunks[target_idx + 1]
        cur_start = target_chunk["start_sec"]
        cur_end = timestamp
        next_start = timestamp
        next_end = next_chunk["end_sec"]

        if (cur_end - cur_start) < MIN_CHUNK_DURATION:
            raise ValueError(
                f"Pull would make current segment too short (< {MIN_CHUNK_DURATION}s)."
            )
        if (next_end - next_start) < MIN_CHUNK_DURATION:
            raise ValueError(
                f"Pull would make next segment too short (< {MIN_CHUNK_DURATION}s)."
            )

        feat_cur = _extract_chunk_features(get_slice(cur_start, cur_end), sr=sr)
        feat_next = _extract_chunk_features(get_slice(next_start, next_end), sr=sr)

        db.update_two_adjacent_chunks(
            chunk_a_id=target_chunk["id"],
            chunk_a_new_end=cur_end,
            chunk_a_features=feat_cur,
            chunk_b_id=next_chunk["id"],
            chunk_b_new_start=next_start,
            chunk_b_features=feat_next,
        )

    # Return refreshed chronological segments ordered by start_sec ASC
    return db.get_track_segments(track_id)
