#!/usr/bin/env python3
"""Vosk streaming STT worker for DeVora.

Protocol (stdin/stdout, JSON-lines):
  in:  {"type":"audio","data":"<base64 pcm16 s16le 16000 mono>"}
  in:  {"type":"flush"}
  in:  {"type":"end"}
  out: {"type":"ready"}
  out: {"type":"partial","text":"..."}
  out: {"type":"final","text":"..."}
"""
import argparse
import base64
import json
import sys
import os

os.environ.setdefault("PYTHONIOENCODING", "utf-8")


def emit(obj):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    args = ap.parse_args()

    from vosk import KaldiRecognizer, Model

    model = Model(args.model)
    rec = KaldiRecognizer(model, 16000)
    emit({"type": "ready"})

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
            chunk = base64.b64decode(msg["data"])
            if rec.AcceptWaveform(chunk):
                res = json.loads(rec.Result())
                text = res.get("text", "")
                if text:
                    emit({"type": "partial", "text": text})
            else:
                res = json.loads(rec.PartialResult())
                text = res.get("partial", "")
                if text:
                    emit({"type": "partial", "text": text})
        elif t == "flush":
            res = json.loads(rec.PartialResult())
            text = res.get("partial", "")
            if text:
                emit({"type": "partial", "text": text})
        elif t == "end":
            res = json.loads(rec.FinalResult())
            text = res.get("text", "")
            emit({"type": "final", "text": text})
            break


if __name__ == "__main__":
    main()
