ALTER TABLE tracks 
ADD COLUMN acoustic_emotion_vector vector(24),
ADD COLUMN acoustic_emotions jsonb;
ADD COLUMN acoustic_emotion_coords point NULL;

CREATE INDEX idx_tracks_acoustic_coords 
    ON public.tracks USING gist (acoustic_emotion_coords);