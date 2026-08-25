#!/usr/bin/env bash
# DeVora — one-shot server installer (Linux, systemd).
# Installs: bun, opencode, piper + id voice, faster-whisper + model,
# repo deps, frontend build, and optional bind9/nginx/SSL hotspot setup.
#
# Usage:
#   ./install.sh                    # install everything (no hotspot/DNS)
#   ./install.sh --hotspot          # + bind9 zone + nginx TLS + CA (gateway 10.42.0.1)
#   ./install.sh --domain NAME      # domain for hotspot DNS (default devora.local)
#   ./install.sh --skip-build       # skip frontend build
#   ./install.sh --help
set -euo pipefail

DOMAIN="${DEVORA_DOMAIN:-devora.local}"
HOTSPOT_IP="${DEVORA_HOTSPOT_IP:-10.42.0.1}"
HOTSPOT_NET="${DEVORA_HOTSPOT_NET:-10.42.0.0/24}"
REPO_URL="${DEVORA_REPO_URL:-https://github.com/mrksvt/DeVora.git}"
PIPER_VOICE="id_ID-news_tts-medium"
DO_HOTSPOT=0
DO_BUILD=1
INSTALL_DIR="${DEVORA_DIR:-$HOME/DeVora}"

usage() {
  sed -n '2,10p' "$0"
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --hotspot) DO_HOTSPOT=1 ;;
    --skip-build) DO_BUILD=0 ;;
    --domain=*) DOMAIN="${arg#*=}" ;;
    --help) usage ;;
  esac
done

need_root() {
  if [[ $EUID -ne 0 ]]; then
    echo "ERROR: butuh root untuk step ini. Jalankan dengan sudo."
    exit 1
  fi
}

say() { printf "\033[1;34m[devora]\033[0m %s\n" "$*"; }

# ---------------------------------------------------------------- bun
install_bun() {
  if command -v bun >/dev/null 2>&1; then
    say "bun sudah ada: $(bun --version)"
  else
    say "Install bun…"
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  fi
}

# ------------------------------------------------------------- opencode
install_opencode() {
  if command -v opencode >/dev/null 2>&1; then
    say "opencode sudah ada: $(opencode --version 2>/dev/null || echo '?')"
  else
    say "Install opencode (npm global)…"
    npm install -g opencode-ai 2>/dev/null || npm install -g opencode
  fi
}

# ------------------------------------------------------------ piper TTS
install_piper() {
  if command -v piper >/dev/null 2>&1; then
    say "piper sudah ada"
  else
    say "Install piper (python)…"
    python3 -m pip install --user piper-tts
    export PATH="$HOME/.local/bin:$PATH"
  fi
  local voice_dir="$HOME/.local/share/piper/models/id"
  if [[ ! -f "$voice_dir/$PIPER_VOICE.onnx" ]]; then
    say "Download voice $PIPER_VOICE…"
    mkdir -p "$voice_dir"
    curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/id/id_ID/$PIPER_VOICE/$PIPER_VOICE.onnx" -o "$voice_dir/$PIPER_VOICE.onnx"
    curl -fsSL "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/id/id_ID/$PIPER_VOICE/$PIPER_VOICE.onnx.json" -o "$voice_dir/$PIPER_VOICE.onnx.json"
  else
    say "Voice piper sudah ada"
  fi
}

# --------------------------------------------------- faster-whisper STT
install_stt() {
  if python3 -c "import faster_whisper" 2>/dev/null; then
    say "faster-whisper sudah ada"
  else
    say "Install faster-whisper…"
    python3 -m pip install --user faster-whisper 2>/dev/null || python3 -m pip install --break-system-packages --user faster-whisper
  fi
  local model_dir="$INSTALL_DIR/models/faster-whisper-base"
  if [[ ! -f "$model_dir/model.bin" ]]; then
    say "Download model faster-whisper-base (~145MB)…"
    mkdir -p "$model_dir"
    python3 - << 'PY'
from huggingface_hub import snapshot_download
import os
snapshot_download("Systran/faster-whisper-base", local_dir=os.path.join(os.environ.get("INSTALL_DIR", os.path.expanduser("~/DeVora")), "models/faster-whisper-base"))
PY
  else
    say "Model STT sudah ada"
  fi
}

# ------------------------------------------------------------ repo + deps
setup_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    say "Repo sudah ada di $INSTALL_DIR — pull…"
    git -C "$INSTALL_DIR" pull --ff-only 2>/dev/null || true
  else
    say "Clone repo → $INSTALL_DIR"
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  say "Install deps (web)…"
  (cd "$INSTALL_DIR/apps/web" && bun install)
  (cd "$INSTALL_DIR/packages/devora" && bun install)
  if [[ $DO_BUILD -eq 1 ]]; then
    say "Build frontend…"
    (cd "$INSTALL_DIR/apps/web" && bunx --bun vite build)
  fi
}

# -------------------------------------------------------------- service
install_service() {
  need_root
  local unit="/etc/systemd/system/devora.service"
  say "Install systemd service $unit"
  cat > "$unit" << EOF
[Unit]
Description=DeVora Voice Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SUDO_USER:-$USER}
WorkingDirectory=$INSTALL_DIR/packages/server
Environment=PROJECT=$INSTALL_DIR
Environment=DEVORA_PIPER_MODEL=$HOME/.local/share/piper/models/id/$PIPER_VOICE.onnx
Environment=DEVORA_PIPER_CONFIG=$HOME/.local/share/piper/models/id/$PIPER_VOICE.onnx.json
Environment=DEVORA_STT_MODEL=$INSTALL_DIR/models/faster-whisper-base
ExecStart=$HOME/.bun/bin/bun run src/index.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable devora
  systemctl restart devora
  say "Service devora aktif — http://127.0.0.1:3000"
}

# --------------------------------------------- bind9 + nginx + SSL hotspot
install_hotspot() {
  need_root
  say "Setup DNS (bind9) + nginx TLS + CA untuk hotspot…"

  # CA + server cert
  mkdir -p /etc/ssl/devora
  if [[ ! -f /etc/ssl/devora/devora-ca.crt ]]; then
    openssl genrsa -out /etc/ssl/devora/devora-ca.key 2048
    openssl req -x509 -new -key /etc/ssl/devora/devora-ca.key -days 3650 -out /etc/ssl/devora/devora-ca.crt -subj "/C=ID/O=Devora Local/CN=Devora Local CA"
  fi
  openssl genrsa -out /etc/ssl/devora/server.key 2048 2>/dev/null
  cat > /tmp/devora-san.cnf << EOF
[req]
distinguished_name = dn
req_extensions = v3_req
[dn]
[v3_req]
[server_cert]
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
DNS.3 = localhost
DNS.4 = backupserver.my.id
IP.1 = $HOTSPOT_IP
IP.2 = 127.0.0.1
EOF
  openssl req -new -key /etc/ssl/devora/server.key -out /tmp/server.csr -subj "/C=ID/O=Devora Local/CN=$DOMAIN"
  openssl x509 -req -in /tmp/server.csr -CA /etc/ssl/devora/devora-ca.crt -CAkey /etc/ssl/devora/devora-ca.key -CAcreateserial -days 825 -out /etc/ssl/devora/server.crt -extensions server_cert -extfile /tmp/devora-san.cnf
  cat /etc/ssl/devora/server.crt /etc/ssl/devora/devora-ca.crt > /etc/ssl/devora/server-fullchain.crt

  # bind9 zone
  if command -v named >/dev/null 2>&1; then
    local db="/etc/bind/db.$DOMAIN"
    cat > "$db" << EOF
\$TTL 300
@   IN  SOA ns.$DOMAIN. admin.$DOMAIN. (
        2026082501 3600 600 86400 300 )
@   IN  NS  ns.$DOMAIN.
ns  IN  A   $HOTSPOT_IP
@   IN  A   $HOTSPOT_IP
*   IN  A   $HOTSPOT_IP
EOF
    grep -q "zone \"$DOMAIN\"" /etc/bind/named.conf.local || cat >> /etc/bind/named.conf.local << EOF

zone "$DOMAIN" {
    type master;
    file "$db";
};
EOF
    # hotspot listen + recursion (idempotent)
    sed -i "s|\(allow-recursion { [^}]*\); }|\1; $HOTSPOT_NET; };|" /etc/bind/named.conf.options
    sed -i "s|\(listen-on { [^}]*\); }|\1; $HOTSPOT_IP; };|" /etc/bind/named.conf.options
    named-checkconf && systemctl reload named 2>/dev/null || systemctl restart named
    say "DNS $DOMAIN → $HOTSPOT_IP (bind9 listen $HOTSPOT_IP:53)"
  else
    say "SKIP bind9 (tidak terinstall) — apt install bind9"
  fi

  # nginx reverse proxy
  if command -v nginx >/dev/null 2>&1; then
    cat > /etc/nginx/sites-available/devora << EOF
server {
    listen 443 ssl;
    http2 on;
    server_name $DOMAIN;
    ssl_certificate /etc/ssl/devora/server-fullchain.crt;
    ssl_certificate_key /etc/ssl/devora/server.key;
    location = /ca.crt {
        alias /etc/ssl/devora/devora-ca.crt;
        default_type application/x-x509-ca-cert;
        add_header Content-Disposition "attachment; filename=devora-ca.crt";
    }
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
}
server {
    listen 80;
    server_name $DOMAIN;
    return 301 https://\$host\$request_uri;
}
EOF
    ln -sf /etc/nginx/sites-available/devora /etc/nginx/sites-enabled/devora
    nginx -t && systemctl reload nginx
    say "nginx https://$DOMAIN → 127.0.0.1:3000"
  else
    say "SKIP nginx (tidak terinstall) — apt install nginx"
  fi

  say "CA tersedia: https://$DOMAIN/ca.crt — install di perangkat klien"
}

# ================================================================= main
main() {
  install_bun
  install_opencode
  install_piper
  install_stt
  setup_repo
  install_service
  [[ $DO_HOTSPOT -eq 1 ]] && install_hotspot
  say "SELESAI. Buka http://127.0.0.1:3000 (atau https://$DOMAIN jika --hotspot)"
}

main
