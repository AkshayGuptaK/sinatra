ALTER TABLE tracks 
ADD COLUMN acoustic_emotion_vector vector(24),
ADD COLUMN acoustic_emotions jsonb;