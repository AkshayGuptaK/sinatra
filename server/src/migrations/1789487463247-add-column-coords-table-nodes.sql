ALTER TABLE tracks
ADD COLUMN IF NOT EXISTS acoustic_emotion_coords point NULL;

CREATE INDEX idx_tracks_acoustic_coords 
    ON public.tracks USING gist (acoustic_emotion_coords);