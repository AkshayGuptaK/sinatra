ALTER TABLE tracks 
ADD COLUMN emotion_vector vector(24),
ADD COLUMN emotions jsonb;