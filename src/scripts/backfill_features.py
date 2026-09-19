import os
import json
from src.pg import get_pg
from src.analysis.torch_features import get_torch_feature
from src.analysis.demucs_features import get_demucs_feature

def sync_features():
    db = get_pg()

    torch_extractor = get_torch_feature()
    demucs_extractor = get_demucs_feature()

    print("Fetching track list...")
    with db.conn.cursor() as cur:
        cur.execute(
            "SELECT id, filepath FROM nodes WHERE features IS NULL AND filepath IS NOT NULL"
        )
        rows = cur.fetchall()

    print(f"Enriching {len(rows)} tracks with acoustic data...")

    batch_updates = []

    for i, (node_id, filepath) in enumerate(rows):
        torch_features = torch_extractor.extract(filepath) or {}
        demucs_features = demucs_extractor.extract(filepath) or {}
        features = torch_features | demucs_features

        if features:
            batch_updates.append((json.dumps(features), node_id))

        if len(batch_updates) >= 10:
            with db.conn.cursor() as cur:
                cur.executemany(
                    "UPDATE nodes SET features = %s WHERE id = %s", batch_updates
                )
            db.conn.commit()
            print(f"   Saved {i+1}/{len(rows)}...", end="\r")
            batch_updates = []

    if batch_updates:
        with db.conn.cursor() as cur:
            cur.executemany(
                "UPDATE nodes SET features = %s WHERE id = %s", batch_updates
            )
        db.conn.commit()

    print("\nEnrichment Complete.")


if __name__ == "__main__":
    sync_features()
