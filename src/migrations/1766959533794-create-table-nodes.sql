CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filepath   TEXT UNIQUE NOT NULL,

    title        TEXT,
    artist       TEXT,
    album        TEXT,

    musical_embedding vector(1024),
    cluster_id INTEGER,
    musical_fruit varchar(20),
    features jsonb,

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);