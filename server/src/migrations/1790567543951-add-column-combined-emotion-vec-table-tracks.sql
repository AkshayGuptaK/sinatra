UPDATE public.tracks
SET lyrical_emotion_vector = ARRAY[
    COALESCE((lyrical_emotions->>'angry')::real, 0.0),
    COALESCE((lyrical_emotions->>'contemplative')::real, 0.0),
    COALESCE((lyrical_emotions->>'fearful')::real, (lyrical_emotions->>'fear')::real, 0.0),
    COALESCE((lyrical_emotions->>'funny')::real, 0.0),
    COALESCE((lyrical_emotions->>'hedonistic')::real, (lyrical_emotions->>'party')::real, 0.0),
    COALESCE((lyrical_emotions->>'infatuated')::real, (lyrical_emotions->>'infatuation')::real, 0.0),
    COALESCE((lyrical_emotions->>'loving')::real, (lyrical_emotions->>'romance')::real, 0.0),
    COALESCE((lyrical_emotions->>'lustful')::real, (lyrical_emotions->>'lust')::real, 0.0),
    COALESCE((lyrical_emotions->>'sad')::real, 0.0),
    COALESCE((lyrical_emotions->>'soothing')::real, 0.0),
    COALESCE((lyrical_emotions->>'uplifting')::real, (lyrical_emotions->>'positive')::real, 0.0)
]::public.vector(11)
WHERE lyrical_emotions IS NOT NULL;