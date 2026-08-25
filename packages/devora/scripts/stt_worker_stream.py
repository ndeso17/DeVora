#!/usr/bin/env python3
"""Streaming STT worker for DeVora (faster-whisper, multilingual).

Reads PCM16 (s16le 16k mono) over stdin JSON-lines. `flush` transcribes a
trailing window for a fast partial (word-by-word feel); `end` transcribes the
full utterance as the final result. Trailing window size via STT_TRAILING_MS
(default 2000). Language from WHISPER_LANG (default: id).
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
    trailing_ms = int(os.environ.get("STT_TRAILING_MS", "2000"))

    import numpy as np
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    emit({"type": "ready"})

    buf = b""
    SAMPLE = 16000 * 2  # bytes per second (s16le mono 16k)
    TRAILING = max(0.2 * SAMPLE, trailing_ms * SAMPLE // 1000)
    last_flushed = 0

    def transcribe(pcm: bytes) -> str:
        if len(pcm) == 0:
            return ""
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        segments, _ = model.transcribe(audio, language=lang, beam_size=1)
        return " ".join(s.text for s in segments).strip()

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
            if len(buf) >= 0.2 * SAMPLE and len(buf) != last_flushed:
                last_flushed = len(buf)
                text = transcribe(buf[-TRAILING:])
                if text:
                    emit({"type": "partial", "text": text})
        elif t == "end":
            text = transcribe(buf)
            emit({"type": "final", "text": text})
            break


if __name__ == "__main__":
    main()
