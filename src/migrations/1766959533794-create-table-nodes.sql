CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filepath   TEXT UNIQUE NOT NULL,

    title        TEXT,
    artist       TEXT,
    album        TEXT,

    musical_embedding vector(1024),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX nodes_musical_idx   ON nodes USING hnsw (musical_embedding vector_cosine_ops);
