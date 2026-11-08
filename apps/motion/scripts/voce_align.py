"""
Tempi delle parole di file vocali con faster-whisper (italiano). Lo chiama scripts/voce.mjs align.

  python3 scripts/voce_align.py [--model small] --prompt "testo atteso" file.wav [--prompt "…" file2.wav …]

Stampa JSON: { "<file>": [ { "w": "parola", "start": 0.12, "end": 0.40 }, … ] }
Serve: pip install faster-whisper  (la prima volta scarica il modello scelto: small ≈ 500 MB)
"""

import json
import sys

try:
    from faster_whisper import WhisperModel
except ImportError:
    sys.exit("Serve faster-whisper: pip install faster-whisper")

args = sys.argv[1:]
model_name = "small"
jobs = []
prompt = None
i = 0
while i < len(args):
    if args[i] == "--model":
        model_name = args[i + 1]
        i += 2
    elif args[i] == "--prompt":
        prompt = args[i + 1]
        i += 2
    else:
        jobs.append((args[i], prompt))
        prompt = None
        i += 1

model = WhisperModel(model_name, device="cpu", compute_type="int8")
out = {}
for path, text in jobs:
    # il testo atteso come prompt aiuta con i nomi propri ("Loyalty Wallet")
    segments, _ = model.transcribe(path, language="it", word_timestamps=True, initial_prompt=text, vad_filter=False)
    words = []
    for seg in segments:
        for w in seg.words or []:
            token = w.word.strip()
            if token:
                words.append({"w": token, "start": round(w.start, 3), "end": round(w.end, 3)})
    out[path] = words
    print(f"{path}: {len(words)} parole", file=sys.stderr)

print(json.dumps(out))
