import argparse
from contextlib import nullcontext, redirect_stdout
import json
from pathlib import Path
import re
import sys
import time
from typing import Any
from psycopg import sql
import requests

from src.pg import get_pg

# =============================================================================
# 1. TRACK IDS TO TEST (Used when --all is NOT passed)
# =============================================================================
SAMPLE_TRACK_IDS: list[str] = []

# =============================================================================
# 2. EMOTION TAXONOMY & DESCRIPTIONS
# =============================================================================
EMOTION_TAXONOMY: dict[str, str] = {
    "angry": "Anger, hostile rebellion, confrontation, arrogance, fierce indignation, rage, and defiance.",
    "fearful": "Fear, visceral terror, chilling dread, impending doom, monstrous/haunting themes, and psychological horror.",
    "sad": "Sadness, grief, mournful reflection, heartbreak, existential despair, and sorrowful loss.",
    "contemplative": "Sober reflection, calm introspection, and profound contemplation.",
    "soothing": "Peace, reassurance, gentle comfort, emotional safety, healing, and calming/soothing.",
    "uplifting": "Optimism, hope, joyous celebration, resilience, and radiant motivation.",
    "loving": "Grounded, enduring devotion, weathered partnership, deep sanctuary, and lifelong commitment.",
    "infatuated": "Infatuation, youthful yearning, nervous butterflies, playful pursuit, daydreaming, and unrequited puppy love.",
    "hedonistic": "High-energy dancing, partying, carefree revelry, and celebratory escapism.",
    "funny": "Satire, parody, tongue-in-cheek irony, playful silliness, absurdist puns, and humor.",
}


# =============================================================================
# OLLAMA PROMPTING & SCORING
# =============================================================================
def build_system_prompt(taxonomy: dict[str, str]) -> str:
    definitions = "\n".join([f"- {k}: {desc}" for k, desc in taxonomy.items()])
    formatted_keys = ",\n  ".join(
        [f'"{k}": <float 0.00 to 1.00>' for k in taxonomy.keys()]
    )

    return f"""You are an expert musicologist and lyric analyst specializing in categorizing the emotional intent and themes of song lyrics.

RATE THE INTENSITY OF EACH EMOTION INDEPENDENTLY ON A CONTINUOUS SCALE FROM 0.00 TO 1.00:
0.00 = Completely absent or irrelevant to the lyrics.
0.50 = Moderate secondary undertone or nuance.
1.00 = Peak, undeniable primary driver of the lyrics.

EMOTION DIMENSIONS AND DEFINITIONS:
{definitions}

SCORING RULES:
1. SCORE EACH DIMENSION INDEPENDENTLY:
- Emotions are NOT mutually exclusive. A track can score high on multiple dimensions if both are genuinely present.
- If a song does not express an emotion, score it near 0.00 (e.g., 0.00 to 0.10). Do not inflate scores artificially.
2. CONSIDER SUBTEXT, IRONY, AND REGISTER:
- Sarcasm, silly brag, or self-deprecating parody should be scored under comedy.
- Narrative songs should be evaluated across the whole lyrical intent.

First, reflect and reason step-by-step through the lyrical subtext, narrative tone, and emotional cues.
You MUST respond with a valid JSON object matching these exact keys:
{{
  {formatted_keys}
}}

Do not include commentary or markdown fences outside the JSON object."""


def query_gemma_emotions(
    lyrics: str,
    taxonomy: dict[str, str],
    model: str = "gemma4:12b",
    host: str = "http://localhost:11434",
    timeout: int = 180,
) -> tuple[dict[str, float] | None, str]:
    url = f"{host.rstrip('/')}/api/chat"
    system_prompt = build_system_prompt(taxonomy)
    user_prompt = f'Song Lyrics to Analyze:\n\n"""\n{lyrics.strip()[:6000]}\n"""'

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "format": "json",
        "think": True,
        "stream": False,
        "options": {
            "temperature": 0.0,
            "num_predict": 4096,
            "num_ctx": 8192,
        },
    }

    try:
        res = requests.post(url, json=payload, timeout=timeout)
        res.raise_for_status()
        res_json = res.json()

        message = res_json.get("message", {})
        thinking = message.get("thinking", "").strip()
        raw_content = message.get("content", "").strip()

        if not thinking and "<think>" in raw_content:
            match = re.search(r"<think>(.*?)</think>", raw_content, flags=re.DOTALL)
            if match:
                thinking = match.group(1).strip()
                raw_content = re.sub(
                    r"<think>.*?</think>", "", raw_content, flags=re.DOTALL
                ).strip()

        if raw_content.startswith("```"):
            raw_content = re.sub(r"^```(?:json)?\s*", "", raw_content)
            raw_content = re.sub(r"\s*```$", "", raw_content).strip()

        if not raw_content and thinking:
            json_match = re.search(r"\{[\s\S]*\}", thinking)
            if json_match:
                raw_content = json_match.group(0)

        parsed = json.loads(raw_content)
        scores_dict = parsed.get("scores", parsed) if isinstance(parsed, dict) else {}

        sanitized = {}
        for k in taxonomy.keys():
            val = float(scores_dict.get(k, 0.0))
            sanitized[k] = round(max(0.0, min(1.0, val)), 3)

        return sanitized, thinking

    except Exception as e:
        print(f"\n⚠️ Ollama scoring error: {e}", file=sys.stderr)
        return None, ""


# =============================================================================
# FORMATTING HELPER FOR INSPECTION
# =============================================================================
def print_track_scores(title: str, artists: str | None, scores: dict[str, float]):
    artist_str = artists if artists else "Unknown Artist"
    print("\n" + "=" * 80)
    print(f"🎵 {title} — {artist_str}")
    print("=" * 80)

    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    for emotion, score in sorted_scores:
        bar_len = int(score * 30)
        bar = "█" * bar_len + "░" * (30 - bar_len)
        print(f"  {emotion:<22} | {score:>5.3f} | {bar}")


# =============================================================================
# MAIN ORCHESTRATOR
# =============================================================================
def ensure_db_column(db):
    """Ensures tracks table has the lyrical_emotions jsonb column."""
    with db.conn.cursor() as cur:
        cur.execute("ALTER TABLE tracks ADD COLUMN IF NOT EXISTS lyrical_emotions JSONB;")
    db.conn.commit()


def run(all_tracks: bool, model: str, host: str, log: str | None = None):
    db = get_pg()

    # 1. Resolve tracks to process
    if all_tracks:
        print("🌍 MODE: Processing ALL tracks with lyrics (DB updates enabled)...")
        ensure_db_column(db)
        query = """
            SELECT id, title, artist, lyrics
            FROM tracks
            WHERE lyrics IS NOT NULL 
              AND TRIM(lyrics) != ''
              AND lyrical_emotions IS NULL
            ORDER BY title ASC;
        """
        params = ()
    else:
        clean_ids = [str(i).strip() for i in SAMPLE_TRACK_IDS if str(i).strip()]
        if not clean_ids:
            print("❌ SAMPLE_TRACK_IDS array at the top of the script is empty.")
            return

        print(
            f"🔬 MODE: Inspecting {len(clean_ids)} sample track(s) (Dry-run, DB updates disabled)..."
        )
        query = """
            SELECT id, title, artist, lyrics
            FROM tracks
            WHERE id::text = ANY(%s::text[])
              AND lyrics IS NOT NULL;
        """
        params = (clean_ids,)

    with db.conn.cursor() as cur:
        cur.execute(query, params)
        rows = cur.fetchall()

    if not rows:
        print("❌ No matching tracks found.")
        return

    total = len(rows)
    print(f"📦 Found {total} track(s) to process.")
    if log:
        print(f"📄 Output logging enabled: {Path(log).resolve()}")

    t_start = time.perf_counter()
    log_fh = open(log, "w", encoding="utf-8") if log else None

    update_query = """
        UPDATE tracks
        SET lyrical_emotions = %s::jsonb,
            updated_at = NOW()
        WHERE id = %s;
    """

    # 2. Unified scoring and output loop
    try:
        with db.conn.cursor() as cur:
            for idx, (t_id, title, artists, lyrics) in enumerate(rows, 1):
                if log_fh:
                    print(
                        f"   [{idx}/{total}] Processing: {title[:35]}...",
                        file=sys.stderr,
                        flush=True,
                    )

                scores, thoughts = query_gemma_emotions(
                    lyrics, EMOTION_TAXONOMY, model=model, host=host
                )

                if scores is None:
                    continue

                # Redirect output if logging is enabled, otherwise print to terminal
                with redirect_stdout(log_fh) if log_fh else nullcontext():
                    if thoughts:
                        print("\n" + "-" * 80)
                        print(f"🤔 MODEL REASONING & SUBTEXT ANALYSIS: {title}")
                        print("-" * 80)
                        print(thoughts.strip())

                    print_track_scores(title, artists, scores)

                # Persist to DB only when --all is enabled
                if all_tracks:
                    cur.execute(update_query, (json.dumps(scores), t_id))
                    if idx % 10 == 0 or idx == total:
                        db.conn.commit()
                        if not log_fh:
                            pct = (idx / total) * 100
                            print(
                                f"   💾 Saved [{idx}/{total}] ({pct:.1f}%)...",
                                flush=True,
                            )

        if all_tracks:
            db.conn.commit()

        elapsed_sec = time.perf_counter() - t_start
        avg_per_track = elapsed_sec / total if total else 0.0
        summary_msg = f"Completed {total} track(s) in {elapsed_sec:.2f}s (~{avg_per_track:.2f}s/track)."

        if log_fh:
            log_fh.write(f"\n{'=' * 80}\n✅ {summary_msg}\n")
            print(f"\n✅ {summary_msg}\n📄 Log file saved to: {Path(log).resolve()}")
        else:
            print("\n" + "=" * 80)
            print(
                f"✅ {summary_msg} {'(Database updated)' if all_tracks else '(Dry-run)'}"
            )

    finally:
        if log_fh:
            log_fh.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Score lyrics independently across custom emotions using Gemma."
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Process ALL un-scored library tracks and save results to 'lyrical_emotions' in DB.",
    )
    parser.add_argument(
        "--log",
        nargs="?",
        const="log.txt",
        default=None,
        help="Redirect thoughts and scores to a file instead of the terminal (default: log.txt).",
    )
    parser.add_argument(
        "--model", type=str, default="gemma4:12b", help="Ollama model tag"
    )
    parser.add_argument(
        "--host", type=str, default="http://localhost:11434", help="Ollama host URL"
    )
    args = parser.parse_args()

    run(all_tracks=args.all, model=args.model, host=args.host, log=args.log)
