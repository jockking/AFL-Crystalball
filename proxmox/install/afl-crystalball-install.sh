#!/usr/bin/env bash
# =============================================================================
# AFL Crystalball — LXC Install / Update Script
# =============================================================================
# Runs INSIDE the LXC container. Do not run on the Proxmox host directly.
# Called by the launcher with:
#   pct exec $CTID -- bash -c "curl -fsSL <url> | bash"          # fresh install
#   pct exec $CTID -- bash -c "curl -fsSL <url> | bash -s -- --update"  # update
# =============================================================================

set -euo pipefail

UPDATE_MODE=0
[[ "${1:-}" == "--update" ]] && UPDATE_MODE=1

APP_DIR="/opt/afl-crystalball"
REPO="https://github.com/jockking/AFL-Crystalball.git"
SERVICE="afl-backend"

# ── Helpers ───────────────────────────────────────────────────────────────────
YW='\033[33m'; GN='\033[1;92m'; RD='\033[01;31m'; CL='\033[m'
TAB="  "
STD=">/dev/null 2>&1"

msg_info()  { echo -e "${TAB}${YW}◉${CL} ${1}..."; }
msg_ok()    { echo -e "${TAB}${GN}✓${CL} ${1}"; }
msg_error() { echo -e "${TAB}${RD}✗ ${1}${CL}" >&2; exit 1; }

# =============================================================================
# UPDATE PATH — git pull, rebuild, restart
# =============================================================================

if [[ $UPDATE_MODE -eq 1 ]]; then
  [[ -d "$APP_DIR" ]] || msg_error "No installation found at ${APP_DIR}. Run a fresh install."

  msg_info "Pulling latest code"
  cd "$APP_DIR"
  git pull --ff-only
  msg_ok "Code updated"

  msg_info "Rebuilding frontend"
  cd "$APP_DIR/frontend"
  npm ci --silent
  VITE_API_BASE=/api npm run build -- --silent
  msg_ok "Frontend rebuilt"

  msg_info "Restarting service"
  systemctl restart "$SERVICE"
  msg_ok "Service restarted"

  echo ""
  msg_ok "Update complete!"
  exit 0
fi

# =============================================================================
# FRESH INSTALL
# =============================================================================

export DEBIAN_FRONTEND=noninteractive

# ── System update ─────────────────────────────────────────────────────────────
msg_info "Updating system packages"
apt-get update -qq
apt-get upgrade -y -qq
msg_ok "System updated"

# ── Core dependencies ─────────────────────────────────────────────────────────
msg_info "Installing dependencies"
apt-get install -y -qq \
  curl git nginx python3 python3-pip python3-venv \
  ca-certificates gnupg
msg_ok "Dependencies installed"

# ── Node.js 20 ────────────────────────────────────────────────────────────────
msg_info "Installing Node.js 20"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
apt-get install -y -qq nodejs
msg_ok "Node.js $(node -v) installed"

# ── Clone repository ──────────────────────────────────────────────────────────
msg_info "Cloning repository"
rm -rf "$APP_DIR"
git clone -q "$REPO" "$APP_DIR"
msg_ok "Repository cloned"

# ── Python virtualenv + backend deps ─────────────────────────────────────────
msg_info "Setting up Python environment"
python3 -m venv "$APP_DIR/venv"
"$APP_DIR/venv/bin/pip" install --quiet --upgrade pip
"$APP_DIR/venv/bin/pip" install --quiet -r "$APP_DIR/backend/requirements.txt"
msg_ok "Python environment ready"

# ── Build React frontend ───────────────────────────────────────────────────────
msg_info "Building frontend (this takes a minute)"
cd "$APP_DIR/frontend"
npm ci --silent
VITE_API_BASE=/api npm run build -- --silent
msg_ok "Frontend built"

# ── nginx ─────────────────────────────────────────────────────────────────────
msg_info "Configuring nginx"
cat > /etc/nginx/sites-available/afl-crystalball << 'NGINX'
server {
    listen 80 default_server;
    server_name _;

    # React SPA
    root /opt/afl-crystalball/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to FastAPI backend
    location /api/ {
        proxy_pass         http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
    }
}
NGINX

rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/afl-crystalball /etc/nginx/sites-enabled/
nginx -t >/dev/null 2>&1
systemctl enable --now nginx >/dev/null 2>&1
systemctl reload nginx
msg_ok "nginx configured"

# ── systemd service for FastAPI backend ───────────────────────────────────────
msg_info "Creating systemd service"
cat > /etc/systemd/system/${SERVICE}.service << EOF
[Unit]
Description=AFL Crystalball — FastAPI Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}/backend
ExecStart=${APP_DIR}/venv/bin/uvicorn api.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now "$SERVICE" >/dev/null 2>&1
msg_ok "Service '${SERVICE}' started"

# ── Verify ────────────────────────────────────────────────────────────────────
msg_info "Waiting for backend to be ready"
for _ in $(seq 1 15); do
  curl -sf http://127.0.0.1:8000/api/sources >/dev/null 2>&1 && break
  sleep 2
done
curl -sf http://127.0.0.1:8000/api/sources >/dev/null 2>&1 \
  && msg_ok "Backend is responding" \
  || msg_error "Backend did not start. Check: journalctl -u ${SERVICE}"

echo ""
msg_ok "AFL Crystalball installed successfully!"
