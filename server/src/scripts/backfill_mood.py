import os
import mutagen
from src.pg import get_pg

def sync_fruits():
    db = get_pg()
    
    print("⏳ Fetching file list...")
    with db.conn.cursor() as cur:
        # Fetch ID and Path for ALL files (we can optimize to fetch only NULL moods later)
        cur.execute("SELECT id, filepath FROM nodes")
        rows = cur.fetchall()

    print(f"Processing {len(rows)} tracks for metadata...")
    
    updates = []
    
    for node_id, filepath in rows:
        if not os.path.exists(filepath):
            continue
            
        try:
            # mutagen.File auto-detects format (mp3, m4a, wma, etc.)
            audio = mutagen.File(filepath)
            
            if audio is None:
                continue

            # Extract Genre (handling different tag formats)
            genre = None
            
            # Standard ID3 (MP3)
            if 'TCON' in audio: 
                genre = audio['TCON'].text[0]
            
            # MP4 / M4A
            elif '©gen' in audio:
                genre = audio['©gen'][0]
                
            # FLAC / Vorbis
            elif 'genre' in audio:
                genre = audio['genre'][0]
            
            # WMA / ASF
            elif 'WM/Genre' in audio:
                genre = audio['WM/Genre'][0].value

            if genre:
                clean_mood = genre.strip()
                updates.append((clean_mood, node_id))
                
        except Exception as e:
            # Silently skip bad tags
            pass

    if updates:
        print(f"💾 Updating {len(updates)} moods in DB...")
        with db.conn.cursor() as cur:
            cur.executemany("UPDATE nodes SET mood = %s WHERE id = %s", updates)
        db.conn.commit()
        print("✅ Metadata sync complete.")
    else:
        print("No new metadata found.")

if __name__ == "__main__":
    sync_fruits()