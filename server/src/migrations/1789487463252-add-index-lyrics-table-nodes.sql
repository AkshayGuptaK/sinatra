CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS nodes_lyrics_trgm_idx 
ON nodes USING GIN (lyrics gin_trgm_ops);