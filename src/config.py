import os
from dotenv import load_dotenv
from pathlib import Path

load_dotenv()


def _pg_dsn():
    return (
        f"dbname={os.getenv('POSTGRES_DB')} "
        f"user={os.getenv('POSTGRES_USER')} "
        f"password={os.getenv('POSTGRES_PASSWORD')} "
        f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
        f"port={os.getenv('POSTGRES_PORT', 5432)}"
    )


config = {
    "port": int(os.getenv("PORT", 8080)),
    "music_dir": os.getenv("MUSIC_DIR"),
    "sync_interval": int(os.getenv("SYNC_INTERVAL", 1800)),
    "postgres_dsn": _pg_dsn(),
}
