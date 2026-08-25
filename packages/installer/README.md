# DeVora CLI

Installer & manajemen server voice DeVora (UI suara untuk OpenCode).

## Install

```bash
# global
npm install -g devora        # atau
pnpm add -g devora           # atau
bun add -g devora

# tanpa install jalankan langsung
npx devora install
```

## Usage

```bash
devora install                # install lengkap (bun, opencode, piper, STT, build, systemd)
devora install --hotspot      # + bind9 DNS + nginx TLS + CA (gateway hotspot 10.42.0.1)
devora start | stop | restart | status
devora doctor                 # cek dependensi
devora ca                     # cara trust CA di perangkat
```

## Environment

| Var | Default | Fungsi |
|---|---|---|
| `DEVORA_DOMAIN` | `devora.local` | domain hotspot |
| `DEVORA_HOTSPOT_IP` | `10.42.0.1` | IP gateway hotspot (listen DNS) |
| `DEVORA_HOTSPOT_NET` | `10.42.0.0/24` | subnet hotspot (allow-recursion) |
| `DEVORA_DIR` | `~/DeVora` | lokasi repo |
| `DEVORA_REPO_URL` | GitHub | source repo |

## Requirements

- Linux (systemd) + sudo
- Internet (download bun, model piper/whisper)
- Optional hotspot: bind9, nginx (diinstall otomatis oleh `install.sh` jika belum)
