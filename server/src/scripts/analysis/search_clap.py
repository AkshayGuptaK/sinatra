import sys
from typing import List, Tuple
from src.pg import get_pg
from src.models.clap import get_clap_embedder


def search_library_by_text(
    prompt: str, limit: int = 10, column_name: str = "semantic_embedding"
):
    """Embeds a natural language prompt and retrieves the top-k nearest tracks from PostgreSQL."""
    embedder = get_clap_embedder()
    db = get_pg()

    print(f'\n🔍 Querying text: "{prompt}"...')

    # 1. Embed prompt text into a 512-dim vector
    text_vector = embedder.extract_text(prompt)
    if text_vector.ndim > 1:
        text_vector = text_vector.squeeze(0)

    # Format vector string for pgvector: "[v0,v1,...,v511]"
    vec_str = f"[{','.join(f'{x:.6f}' for x in text_vector)}]"

    # 2. Cosine distance similarity query (<=> operator in pgvector)
    query = f"""
    SELECT 
        id::text,
        COALESCE(title, 'Unknown Title') AS title,
        COALESCE(artist, 'Unknown Artist') AS artist,
        ROUND(({column_name} <=> %s::vector)::numeric, 4) AS distance
    FROM tracks
    WHERE {column_name} IS NOT NULL
    ORDER BY {column_name} <=> %s::vector ASC
    LIMIT %s;
    """

    with db.conn.cursor() as cur:
        cur.execute(query, (vec_str, vec_str, limit))
        results = cur.fetchall()

    if not results:
        print("No matching records found (or column has no embedded rows).")
        return

    # 3. Formatted display
    print(f'\n🎧 TOP {limit} RESULTS FOR: "{prompt}"')
    print("-" * 88)
    print(f"{'Dist':<8} | {'Title':<30} | {'Artist':<22}")
    print("-" * 88)

    for track_id, title, artist, dist in results:
        print(f"{dist:<8.4f} | {title[:28]:<30} | {artist[:20]:<22}")

    print("-" * 88 + "\n")


def interactive_loop():
    print("=" * 88)
    print("🎵 Sinatra Semantic Music Search (LAION-CLAP)")
    print("Type a prompt and press Enter to search. Type 'exit' or Ctrl+C to quit.")
    print("=" * 88)

    while True:
        try:
            prompt = input("Search prompt > ").strip()
            if not prompt:
                continue
            if prompt.lower() in ("exit", "quit", ":q"):
                break
            search_library_by_text(prompt)
        except (KeyboardInterrupt, EOFError):
            print("\nExiting search.")
            break


if __name__ == "__main__":
    if len(sys.argv) > 1:
        # One-shot command line query: uv run python -m src.scripts.search_clap "lofi chill beat"
        prompt_arg = " ".join(sys.argv[1:])
        search_library_by_text(prompt_arg)
    else:
        # Interactive prompt loop
        interactive_loop()
