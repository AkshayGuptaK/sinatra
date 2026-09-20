import sys
from pathlib import Path
import numpy as np
import pandas as pd
from psycopg import sql
from src.config import config
from src.pg import get_pg

BATCH_SIZE = 500
PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"


def sanitize_ident(col_name: str) -> str:
    """Cleans column names containing slashes, hyphens, or spaces for PostgreSQL."""
    return (
        col_name.strip()
        .replace("/", "_")
        .replace("-", "_")
        .replace(" ", "_")
        .replace("'", "")
    )


def map_dtype_to_pg(series: pd.Series) -> str:
    """Maps Pandas series data types to PostgreSQL column types."""
    if pd.api.types.is_integer_dtype(series):
        return "BIGINT"
    if pd.api.types.is_float_dtype(series):
        return "DOUBLE PRECISION"
    if pd.api.types.is_bool_dtype(series):
        return "BOOLEAN"
    return "TEXT"


def load_parquet_to_postgres(parquet_path: Path | str = PARQUET_PATH):
    path = Path(parquet_path)
    if not path.exists():
        print(f"❌ File not found: {path}")
        return

    print(f"Reading Parquet file from {path}...")
    df = pd.read_parquet(path)
    print(f"Loaded DataFrame: {len(df)} rows, {len(df.columns)} columns.")

    if "audio" in df.columns:
        df["audio_path"] = df["audio"].apply(
            lambda x: x.get("path") if isinstance(x, dict) else None
        )
        df = df.drop(columns=["audio"])

    column_mappings = [
        (orig_col, sanitize_ident(orig_col), map_dtype_to_pg(df[orig_col]))
        for orig_col in df.columns
    ]

    db = get_pg()
    table_name = "cowen_dataset"

    col_definitions = [
        sql.SQL("{} {}").format(sql.Identifier(pg_col), sql.SQL(pg_type))
        for _, pg_col, pg_type in column_mappings
    ]

    create_table_query = sql.SQL(
        """
        DROP TABLE IF EXISTS {table};
        CREATE TABLE {table} (
            cowen_row_id BIGSERIAL PRIMARY KEY,
            {columns}
        );
        """
    ).format(
        table=sql.Identifier(table_name),
        columns=sql.SQL(",\n    ").join(col_definitions),
    )

    with db.conn.cursor() as cur:
        print(f"Recreating table '{table_name}' in PostgreSQL...")
        cur.execute(create_table_query)
    db.conn.commit()

    col_identifiers = [sql.Identifier(pg_col) for _, pg_col, _ in column_mappings]
    insert_query = sql.SQL(
        "INSERT INTO {table} ({columns}) VALUES ({placeholders})"
    ).format(
        table=sql.Identifier(table_name),
        columns=sql.SQL(", ").join(col_identifiers),
        placeholders=sql.SQL(", ").join([sql.SQL("%s")] * len(column_mappings)),
    )

    def _clean_val(v):
        if pd.isna(v):
            return None
        if isinstance(v, (np.integer, np.floating)):
            return v.item()
        return v

    raw_data = df.to_dict(orient="records")
    records = [
        tuple(_clean_val(row[orig_col]) for orig_col, _, _ in column_mappings)
        for row in raw_data
    ]

    print(f"Inserting {len(records)} rows into '{table_name}'...")
    with db.conn.cursor() as cur:
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i : i + BATCH_SIZE]
            cur.executemany(insert_query, batch)
            print(
                f"Inserted {min(i + BATCH_SIZE, len(records))}/{len(records)} rows..."
            )
    db.conn.commit()

    print(f"✅ Successfully loaded {len(records)} rows into '{table_name}'.")


if __name__ == "__main__":
    target_parquet = sys.argv[1] if len(sys.argv) > 1 else PARQUET_PATH
    load_parquet_to_postgres(target_parquet)
