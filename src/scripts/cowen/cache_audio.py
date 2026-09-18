from pathlib import Path
import pandas as pd
from src.config import config

PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"
OUTPUT_DIR = config["project_root"] / "datasets" / "audio_cache"


def dump_audio_cache():
    if not PARQUET_PATH.exists():
        print(f"File not found: {PARQUET_PATH}")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Reading Parquet file from {PARQUET_PATH}...")
    df = pd.read_parquet(PARQUET_PATH)
    total = len(df)
    print(f"Loaded {total} rows. Exporting clips to {OUTPUT_DIR}...")

    saved_count = 0
    skipped_count = 0

    for idx, row in df.iterrows():
        audio_entry = row.get("audio")
        if not isinstance(audio_entry, dict):
            skipped_count += 1
            continue

        raw_bytes = audio_entry.get("bytes")
        rel_path = audio_entry.get("path")

        if not raw_bytes or not rel_path:
            skipped_count += 1
            continue

        # Preserve the exact relative path structure / filename
        out_file = OUTPUT_DIR / Path(rel_path).name
        out_file.write_bytes(raw_bytes)
        saved_count += 1

        if (idx + 1) % 100 == 0 or (idx + 1) == total:
            print(f"Extracted {idx + 1}/{total} clips...", end="\r", flush=True)

    print(
        f"\nDone! Extracted {saved_count} audio clips into {OUTPUT_DIR} (Skipped {skipped_count})."
    )


if __name__ == "__main__":
    dump_audio_cache()