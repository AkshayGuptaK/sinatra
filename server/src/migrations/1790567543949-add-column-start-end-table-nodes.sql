ALTER TABLE nodes 
    ADD COLUMN IF NOT EXISTS music_start float8,
    ADD COLUMN IF NOT EXISTS music_end float8;