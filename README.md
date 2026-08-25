# DeVora — Voice Agent UI (Web)

DeVora = UI suara untuk coding agent. **OpenCode hanya core agent** di belakang;
UI, mic, TTS, dan pipeline voice semuanya milik DeVora.

> ⚠️ **Keamanan:** jangan pernah commit `opencode.json` / `opencode.server.json`
> (berisi API key). Sudah di `.gitignore`. Contoh config ada di `opencode.example.json`.

## Arsitektur

```
Browser (React web app: mic, playback, voice screen)
   │  WebSocket /ws (audio PCM16 16k + events)
   ▼
DeVora Server (packages/server — Bun)
   │  VoiceController: VAD → STT → narration → piper TTS
   │  @opencode-ai/sdk
   ▼
opencode serve (core agent)  ── LLM provider (9router / openrouter / dll)
```

## Requirements

- Linux + systemd (server), sudo untuk hotspot setup
- [bun](https://bun.sh) ≥ 1.x
- [opencode](https://opencode.ai) CLI
- [piper](https://github.com/rhasspy/piper) + voice `id_ID-news_tts-medium`
- Python 3 + faster-whisper (STT streaming) — `pip install faster-whisper`
- LLM gateway (opsional, contoh 9router di `127.0.0.1:20128`)

## Download Model

| Model | Untuk | Ukuran | Download |
|---|---|---|---|
| **piper `id_ID-news_tts-medium`** | TTS suara Indonesia | ~60MB | `https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/id/id_ID/news_tts-medium/id_ID-news_tts-medium.onnx` (+ `.onnx.json`) |
| **faster-whisper-base** | STT streaming (id, real-time) | ~145MB | `https://huggingface.co/Systran/faster-whisper-base` (HuggingFace Hub) |
| **whisper `base.pt`** (opsional) | STT batch fallback | ~140MB | `https://openaipublic.azureedge.net/main/whisper/models/ed3a0b6b1c0edf879ad9b11b1af5a0e6ab5db9205f891f668f8b0e6c6326e34e/base.pt` |

Lokasi default (`models/` di repo):

```bash
mkdir -p models/id models/faster-whisper-base

# piper voice id
curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/id/id_ID/news_tts-medium/id_ID-news_tts-medium.onnx" -o ~/.local/share/piper/models/id/id_ID-news_tts-medium.onnx
curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/id/id_ID/news_tts-medium/id_ID-news_tts-medium.onnx.json" -o ~/.local/share/piper/models/id/id_ID-news_tts-medium.onnx.json

# faster-whisper (streaming STT)
python -m pip install faster-whisper huggingface_hub
python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-base', local_dir='models/faster-whisper-base')"
```

## Menjalankan

### Server

```bash
cd packages/server
PROJECT=$HOME/DeVora bun run src/index.ts
```

- HTTP + WS: port `3000` (`http://127.0.0.1:3000`, `/ws`)
- Otomatis spawn `opencode serve` (port acak internal)
- Butuh: `piper` + voice id (PATH), model STT di `models/`, `.venv` (python),
  `opencode` di PATH, LLM gateway (9router `127.0.0.1:20128`)

Env opsional:

| Var | Default | Fungsi |
|---|---|---|
| `PROJECT` | cwd | project directory opencode |
| `PORT` | `3000` | port server |
| `DEVORA_PIPER_MODEL/CONFIG` | `~/.local/share/piper/models/id/...` | model piper |
| `DEVORA_STT_MODEL` | `models/faster-whisper-base` | model STT |
| `WHISPER_LANG` | `id` | bahasa STT |
| `STT_TRAILING_MS` | `2000` | window partial STT |
| `DEVORA_TLS_CERT/KEY` | — | aktifkan HTTPS langsung |

### Web frontend (dev)

```bash
cd apps/web
bun install
bunx --bun vite --host 0.0.0.0
# buka http://<host>:5173 — proxy /ws ke 127.0.0.1:3000
```

### Build produksi

```bash
cd apps/web && bunx --bun vite build   # → dist/ (diserve server)
```

## Akses dari luar (VPS firewall)

```bash
# SSH tunnel (cepat, sudah teruji):
ssh -f -N -L 3000:127.0.0.1:3000 anlap05
# buka http://127.0.0.1:3000
```

## Protocol WS (client → server)

| message | field | fungsi |
|---|---|---|
| `start` | — | mulai listening (VAD aktif) |
| `stop` | — | berhenti listening |
| `audio` | `data` (base64 PCM16 16k mono) | kirim chunk mic |
| `interrupt` | — | barge-in / stop agent |
| `submit` | `text` | keyboard fallback |
| `create_session` | `directory`, `title?`, `model?` `{providerID, modelID}` | buat sesi baru di project directory |
| `select_session` | `id`, `model?` | pindah ke sesi yang sudah ada |
| `set_model` | `providerID`, `modelID` | ganti model di tengah percakapan |
| `list_dir` | `path?` | browse folder (project picker) |

Server → client: `{type:"state", snapshot}`, `{type:"audio", wav}`,
`{type:"error", message}`, `{type:"context", context}` (Project/MCP/Skills/Models),
`{type:"sessions", sessions}`, `{type:"session-selected", sessionId}`,
`{type:"dir_list", path, parent, dirs}`, `{type:"model", model}`.

## Test

```bash
cd packages/devora && bun test   # 48 test (unit + E2E mock)
```

## Instalasi otomatis

```bash
# via package manager (setelah publish)
npm install -g devora
pnpm add -g devora
bun add -g devora
npx devora install

# atau script shell langsung
./install.sh                    # install dasar
sudo ./install.sh --hotspot     # + bind9 DNS + nginx TLS + CA (gateway hotspot)

# hotspot mode menghasilkan:
#   DNS: devora.local → 10.42.0.1 (bind9 listen gateway)
#   TLS: https://devora.local  (CA: https://devora.local/ca.crt)
```

Config LLM — buat `opencode.json` sendiri (jangan di-commit):

```json
{
  "model": "9router/bai/deepseek-v4-flash",
  "provider": {
    "9router": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "9Router",
      "options": {
        "baseURL": "http://127.0.0.1:20128/v1",
        "apiKey": "YOUR_KEY_HERE"
      },
      "models": {
        "bai/deepseek-v4-flash": { "name": "DeepSeek V4 Flash" }
      }
    }
  }
}
```

## DNS + SSL (hotspot)

- **DNS**: bind9 listen `10.42.0.1:53` — `devora.local` → `10.42.0.1` (client hotspot set DNS `10.42.0.1`)
- **TLS**: CA lokal `Devora Local CA` + fullchain di `/etc/ssl/devora/`; nginx `https://devora.local` → `127.0.0.1:3000` (WebSocket upgrade)
- **Trust CA**: unduh `https://devora.local/ca.crt`, install di perangkat → `https://devora.local` tanpa warning + Web Speech API aktif (secure context)
