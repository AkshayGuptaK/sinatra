import argparse
from src.pg import get_pg
from src.models.projector.mood_projector import MoodProjector

BATCH_SIZE = 100


def generate_library_coords(method: str = "kr", k: int = 5):
    projector = MoodProjector(method=method, k=k)
    db = get_pg()

    with db.conn.cursor() as cur:
        cur.execute(
            "SELECT filepath, emotions, emotions_normalized FROM nodes WHERE emotions IS NOT NULL;"
        )
        rows = cur.fetchall()

    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        emotions_input = [(r[1], r[2]) for r in batch]
        coords = projector.project_batch(emotions_input)

        update_payloads = [(x, y, r[0]) for (x, y), r in zip(coords, batch)]

        with db.conn.cursor() as cur:
            cur.executemany(
                "UPDATE nodes SET coord_x = %s, coord_y = %s, updated_at = NOW() WHERE filepath = %s;",
                update_payloads,
            )
        db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate 2D manifold coordinates for library tracks."
    )
    parser.add_argument(
        "method",
        nargs="?",
        default="kr",
        choices=["kr", "knn"],
        help="Projection method: 'kr' (Kernel Ridge) or 'knn' (k-NN Barycentric). Defaults to 'kr'.",
    )
    parser.add_argument(
        "--k",
        type=int,
        default=5,
        help="Number of nearest neighbors to average if using knn mode. Defaults to 5.",
    )

    args = parser.parse_args()
    generate_library_coords(method=args.method, k=args.k)
