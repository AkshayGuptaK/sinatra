from pathlib import Path
import pandas as pd
from src.config import config

parquet_path = config["project_root"] / "datasets" / "cowen.parquet"

print(f"Loading from {parquet_path}...")
df = pd.read_parquet(parquet_path)
print(f"Total clips: {len(df)}, Total columns: {len(df.columns)}\n")

# Inspect the 'audio' column in row 0
first_row = df.iloc[0]
audio_val = first_row.get("audio")

print("=" * 80)
print("INSPECTING ROW 0: 'audio' COLUMN CONTENTS")
print("=" * 80)

if isinstance(audio_val, dict):
    for k, v in audio_val.items():
        if k == "bytes" or isinstance(v, bytes):
            print(f"  • {k:<15} : <bytes: length {len(v)} bytes>")
        else:
            print(f"  • {k:<15} : {v}")
else:
    print(f"Audio value is not a dict: {type(audio_val)} -> {audio_val}")

print("\n" + "=" * 80)
print("ALL PATHS / IDS IN DATASET:")
print("=" * 80)

for idx in range(min(1841, len(df))):
    row_audio = df.iloc[idx].get("audio")
    if isinstance(row_audio, dict):
        path_str = row_audio.get("path")
        print(f"Row {idx:4d} | path: {path_str}")
    else:
        print(f"Row {idx:4d} | audio: {row_audio}")
print("=" * 80)