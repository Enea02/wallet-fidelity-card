"""
Rileva i beat del brano e aggiorna music.json: da lì tutte le scene si riallineano ai beat veri.

Uso:  pnpm --filter @loyalty/motion beats music/brano.mp3 [--offset 1.85]
      (prima: pip install librosa)

--offset  secondo del brano da cui parte il video (beat 0). Senza, si usa il primo beat rilevato.
          Il beat 0 viene allineato al beat rilevato più vicino a --offset.
Stampa BPM, numero di beat e dove cadono i primi, così si può controllare a orecchio.
"""

import json
import sys
from pathlib import Path

try:
    import librosa
except ImportError:
    sys.exit("Serve librosa: pip install librosa")

APP = Path(__file__).resolve().parent.parent
args = sys.argv[1:]
if not args:
    sys.exit(__doc__)
track = Path(args[0])
offset = float(args[args.index("--offset") + 1]) if "--offset" in args else None

path = track if track.is_absolute() else (Path.cwd() / track)
if not path.exists():
    path = APP / track
if not path.exists():
    sys.exit(f"File non trovato: {track}")

y, sr = librosa.load(str(path), sr=None, mono=True)
tempo, frames = librosa.beat.beat_track(y=y, sr=sr, units="frames")
beats = librosa.frames_to_time(frames, sr=sr).tolist()
if not beats:
    sys.exit("Nessun beat rilevato: imposta bpm e offset a mano in music.json")

if offset is not None:
    first = min(range(len(beats)), key=lambda i: abs(beats[i] - offset))
    beats = beats[first:]

bpm = float(tempo[0] if hasattr(tempo, "__len__") else tempo)
music_file = APP / "music.json"
music = json.loads(music_file.read_text()) if music_file.exists() else {}
try:
    rel = path.resolve().relative_to(APP).as_posix()
except ValueError:
    sys.exit(f"Metti il brano dentro {APP / 'music'} (l'anteprima lo serve da lì)")
music.update({"file": rel, "bpm": round(bpm, 2), "offset": round(beats[0], 4), "beats": [round(b, 4) for b in beats]})
music_file.write_text(json.dumps(music, indent=2) + "\n")

print(f"{rel}: {bpm:.1f} BPM, {len(beats)} beat, beat 0 a {beats[0]:.3f} s")
print("primi beat (s):", " ".join(f"{b:.2f}" for b in beats[:12]))
print("Durata del video con la beat sheet attuale: guarda l'anteprima (pnpm --filter @loyalty/motion dev)")
