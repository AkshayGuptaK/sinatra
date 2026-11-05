import math
import sys
import numpy as np
from psycopg import sql

from src.pg import get_pg

# =============================================================================
# 10 EMOTIONS IN EXACT CLOCKWISE / PERIMETER ORDER
# Supports both short keys and full snake_case taxonomy keys
# =============================================================================
EMOTION_KEYS = [
    ("angry", ["angry_defiant", "angry"]),
    ("fearful", ["fear_dread", "fearful"]),
    ("sad", ["sad_grieving", "sad"]),
    ("solemn", ["solemn", "contemplative"]),
    ("soothing", ["soothing_comfort", "soothing"]),
    ("uplifting", ["uplifting_positive", "uplifting"]),
    ("loving", ["romance", "loving"]),
    ("infatuated", ["infatuation_crush", "infatuated"]),
    ("lustful", ["lustful_suggestive", "lustful"]),
    ("hedonistic", ["party_hedonism", "hedonistic"]),
    ("funny", ["comedic_funny", "funny"]),
]

ANGLES_DEG = [0.0 + i * (360.0 // 11) for i in range(11)]

EMOTION_ANCHORS = {}
for i, (name, _) in enumerate(EMOTION_KEYS):
    rad = math.radians(ANGLES_DEG[i] % 360.0)
    EMOTION_ANCHORS[name] = (round(math.cos(rad), 4), round(math.sin(rad), 4))


def extract_emotion_scores(raw_dict: dict) -> dict[str, float]:
    """Maps varied taxonomy key names to the canonical 10 emotion names."""
    scores = {}
    for canonical_name, aliases in EMOTION_KEYS:
        val = 0.0
        for alias in aliases:
            if alias in raw_dict and raw_dict[alias] is not None:
                val = float(raw_dict[alias])
                break
        scores[canonical_name] = max(0.0, min(1.0, val))
    return scores


def compute_track_coordinates(
    scores: dict[str, float], scale_by_intensity: bool = True
) -> tuple[float, float]:
    """
    Computes (x, y) based on:
    1. Only emotions >= 0.50 (max 3).
    2. Fallback to single highest if none >= 0.50.
    3. Center of mass weighted by scores.
    """
    eligible = [(k, v) for k, v in scores.items() if v >= 0.50]
    eligible.sort(key=lambda item: item[1], reverse=True)

    if eligible:
        active = eligible[:3]
    else:
        # Fallback to single highest score
        max_k, max_v = max(scores.items(), key=lambda item: item[1])
        active = [(max_k, max_v)]

    sum_weights = sum(v for _, v in active)
    if sum_weights <= 0:
        return (0.0, 0.0)

    # Weighted center of mass
    x_cm = sum(v * EMOTION_ANCHORS[k][0] for k, v in active) / sum_weights
    y_cm = sum(v * EMOTION_ANCHORS[k][1] for k, v in active) / sum_weights

    # Scale radius by peak intensity so weak matches stay closer to neutral origin
    if scale_by_intensity:
        peak_intensity = max(v for _, v in active)
        x_cm *= peak_intensity
        y_cm *= peak_intensity

    return (round(x_cm, 4), round(y_cm, 4))



def run_projection():
    db = get_pg()
    print("=" * 80)
    print("🪐 COMPUTING 2D LYRICAL EMOTION COORDINATES (CENTER OF MASS)")
    print("=" * 80)

    query = """
        SELECT id, title, artist, lyrical_emotions
        FROM tracks
        WHERE lyrical_emotions IS NOT NULL;
    """
    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    if not rows:
        print(
            "❌ No tracks found with 'lyrical_emotions'. Run score_lyrics_gemma.py --all first."
        )
        return

    print(f"📦 Found {len(rows)} tracks with lyrical emotion profiles.")

    update_records = []
    sample_preview = []

    for track_id, title, artists, emo_json in rows:
        if isinstance(emo_json, str):
            import json

            emo_dict = json.loads(emo_json)
        else:
            emo_dict = emo_json or {}

        scores = extract_emotion_scores(emo_dict)
        x, y = compute_track_coordinates(scores, scale_by_intensity=True)

        update_records.append((x, y, track_id))

        if len(sample_preview) < 8:
            sample_preview.append(
                (
                    title,
                    artists or "Unknown",
                    x,
                    y,
                    max(scores.items(), key=lambda t: t[1]),
                )
            )

    # Batch update coordinates
    print(f"💾 Updating coordinates for {len(update_records)} tracks...")
    update_query = """
        UPDATE tracks
        SET lyrical_emotion_coords = point(%s, %s),
            updated_at = NOW()
        WHERE id = %s;
    """
    with db.conn.cursor() as cur:
        cur.executemany(update_query, update_records)
    db.conn.commit()

    print(
        f"✅ Successfully wrote coordinates to 'tracks.lyrical_emotion_coords' (point type)."
    )


if __name__ == "__main__":
    run_projection()
