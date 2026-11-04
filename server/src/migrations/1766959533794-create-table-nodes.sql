CREATE TABLE tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filepath   TEXT UNIQUE NOT NULL,

    title        TEXT,
    artist       TEXT,
    album        TEXT,
    mood varchar(20),

    acoustic_embedding vector(1024),

    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);