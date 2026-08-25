#!/usr/bin/env python3
"""openai-whisper multilingual STT worker for DeVora (Indonesian fallback).

Transcribes raw PCM16 (s16le, 16000 mono) fed over stdin. `flush` transcribes
the trailing ~5 s window for a cheap partial; `end` transcribes the full
utterance as the final result. Language from WHISPER_LANG env (default: id).
"""
import argparse
import base64
import json
import os
import sys

os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    args = ap.parse_args()
    lang = os.environ.get("WHISPER_LANG", "id")

    import numpy as np
    import whisper

    model = whisper.load_model(args.model)
    emit({"type": "ready"})

    buf = b""
    SAMPLE = 16000 * 2  # bytes per second (s16le mono 16k)
    TRAILING = 5 * SAMPLE

    def transcribe(pcm: bytes) -> str:
        if len(pcm) == 0:
            return ""
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        result = model.transcribe(audio, language=lang, fp16=False)
        return (result.get("text") or "").strip()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        t = msg.get("type")
        if t == "audio":
            buf += base64.b64decode(msg["data"])
        elif t == "flush":
            if len(buf) >= 0.3 * SAMPLE:
                text = transcribe(buf[-TRAILING:])
                if text:
                    emit({"type": "partial", "text": text})
        elif t == "end":
            text = transcribe(buf)
            emit({"type": "final", "text": text})
            break


if __name__ == "__main__":
    main()
