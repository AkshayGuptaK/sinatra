CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS tracks_lyrics_trgm_idx 
ON tracks USING GIN (lyrics gin_trgm_ops);