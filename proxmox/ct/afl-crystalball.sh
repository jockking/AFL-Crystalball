#!/usr/bin/env bash
# =============================================================================
# AFL Crystalball — Proxmox LXC Launcher
# =============================================================================
# Run on the Proxmox HOST as root.
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/jockking/AFL-Crystalball/main/proxmox/ct/afl-crystalball.sh)
#
# On first run:  creates an LXC container and deploys the app.
# On re-run:     detects the existing container and offers update / reinstall.
# =============================================================================

set -euo pipefail

# ── App config ────────────────────────────────────────────────────────────────
APP="AFL Crystalball"
NSAPP="afl-crystalball"
INSTALL_SCRIPT="https://raw.githubusercontent.com/jockking/AFL-Crystalball/main/proxmox/install/afl-crystalball-install.sh"

# ── Container defaults (change here if needed) ────────────────────────────────
CT_HOSTNAME="afl-crystalball"
CT_CORES=2
CT_RAM=1024          # MB
CT_DISK=8            # GB
CT_STORAGE="local-lvm"   # Run: pvesm status  — to check your pool name
CT_BRIDGE="vmbr0"
CT_UNPRIVILEGED=1
CT_ONBOOT=1
TEMPLATE_SEARCH="ubuntu-24.04-standard"

# ── Colours & helpers (styled after community-scripts) ────────────────────────
YW='\033[33m'; GN='\033[1;92m'; RD='\033[01;31m'; CY='\033[96m'
BL='\033[36m'; DGN='\033[32m'; CL='\033[m'; BGN='\033[4;92m'
BOLD='\033[1m'; TAB="  "

msg_info()  { echo -e "${TAB}${YW}◉${CL} ${1}..."; }
msg_ok()    { echo -e "${TAB}${GN}✓${CL} ${1}"; }
msg_error() { echo -e "${TAB}${RD}✗ ${1}${CL}" >&2; exit 1; }
msg_warn()  { echo -e "${TAB}${YW}⚠${CL}  ${1}"; }

header_info() {
  clear
  cat <<'EOF'

    _    _____ _       ____                  _        _ _           _ _
   / \  |  ___| |     / ___|_ __ _   _ ___ | |_ __ _| | |__   __ _| | |
  / _ \ | |_  | |    | |   | '__| | | / __|| __/ _` | | '_ \ / _` | | |
 / ___ \|  _| | |___ | |___| |  | |_| \__ \| || (_| | | |_) | (_| | | |
/_/   \_\_|   |_____| \____|_|   \__, |___/ \__\__,_|_|_.__/ \__,_|_|_|
                                  |___/

EOF
  echo -e "${TAB}${BL}Proxmox LXC Deployment${CL}\n"
}

# ── Preflight ─────────────────────────────────────────────────────────────────
header_info

[[ $EUID -eq 0 ]]                  || msg_error "Run as root on the Proxmox host."
command -v pct    >/dev/null 2>&1  || msg_error "'pct' not found — run this on the Proxmox host."
command -v pveam  >/dev/null 2>&1  || msg_error "'pveam' not found — run this on the Proxmox host."

# Verify storage pool
pct listsnapshot 2>/dev/null || true
pvesh get /storage/"$CT_STORAGE" --output-format json >/dev/null 2>&1 \
  || msg_error "Storage '$CT_STORAGE' not found.\n  Check: pvesm status\n  Then edit CT_STORAGE in this script."

# ── Check for existing container ──────────────────────────────────────────────
EXISTING_CTID=$(pct list 2>/dev/null | awk -v name="$CT_HOSTNAME" '$3==name {print $1}' | head -1)

if [[ -n "$EXISTING_CTID" ]]; then
  echo -e "${TAB}${YW}Container '${CT_HOSTNAME}' already exists (ID: ${EXISTING_CTID}).${CL}\n"
  echo -e "${TAB}  ${BOLD}1)${CL} Update app (git pull + rebuild)"
  echo -e "${TAB}  ${BOLD}2)${CL} Reinstall from scratch"
  echo -e "${TAB}  ${BOLD}3)${CL} Exit"
  echo ""
  read -rp "    Choice [1]: " choice

  case "${choice:-1}" in
    1)
      msg_info "Running update inside container ${EXISTING_CTID}"
      pct exec "$EXISTING_CTID" -- bash -c \
        "curl -fsSL ${INSTALL_SCRIPT} | bash -s -- --update"
      CT_IP=$(pct exec "$EXISTING_CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
      echo ""
      echo -e "${TAB}${GN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
      echo -e "${TAB}${GN} Update complete!${CL}"
      echo -e "${TAB}${GN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
      echo -e "${TAB}${CY}App URL:${CL}  http://${CT_IP}"
      echo ""
      exit 0
      ;;
    2)
      echo ""
      read -rp "    Destroy container ${EXISTING_CTID} and redeploy? [y/N] " confirm
      [[ "$confirm" =~ ^[Yy]$ ]] || { echo "  Aborted."; exit 0; }
      msg_info "Stopping container"
      pct stop "$EXISTING_CTID" 2>/dev/null || true
      sleep 2
      msg_info "Destroying container"
      pct destroy "$EXISTING_CTID" --purge 2>/dev/null || true
      msg_ok "Container removed"
      ;;
    *)
      echo "  Exiting."
      exit 0
      ;;
  esac
fi

# ── Allocate container ID ─────────────────────────────────────────────────────
CTID=$(pvesh get /cluster/nextid 2>/dev/null)
[[ -n "$CTID" ]] || msg_error "Could not allocate a container ID."
msg_ok "Container ID: ${CTID}"

# ── Get LXC template ──────────────────────────────────────────────────────────
echo ""
msg_info "Checking LXC template"

TEMPLATE=$(pveam list local 2>/dev/null \
  | grep "$TEMPLATE_SEARCH" \
  | awk '{print $1}' \
  | sed 's|local:vztmpl/||' \
  | sort -V | tail -1)

if [[ -z "$TEMPLATE" ]]; then
  msg_info "Downloading Ubuntu 24.04 template (one-time, ~130 MB)"
  pveam update >/dev/null 2>&1
  TEMPLATE_FULL=$(pveam available --section system 2>/dev/null \
    | grep "$TEMPLATE_SEARCH" \
    | awk '{print $2}' \
    | sort -V | tail -1)
  [[ -n "$TEMPLATE_FULL" ]] || msg_error "Ubuntu 24.04 template not found.\n  Try: pveam update && pveam available --section system | grep ubuntu-24"
  pveam download local "$TEMPLATE_FULL" >/dev/null 2>&1 \
    || msg_error "Template download failed."
  TEMPLATE="$TEMPLATE_FULL"
  msg_ok "Downloaded ${TEMPLATE}"
else
  msg_ok "Using cached template: ${TEMPLATE}"
fi

# ── Create container ──────────────────────────────────────────────────────────
echo ""
msg_info "Creating LXC container"

pct create "$CTID" "local:vztmpl/${TEMPLATE}" \
  --hostname    "$CT_HOSTNAME" \
  --cores       "$CT_CORES" \
  --memory      "$CT_RAM" \
  --swap        512 \
  --rootfs      "${CT_STORAGE}:${CT_DISK}" \
  --net0        "name=eth0,bridge=${CT_BRIDGE},ip=dhcp,firewall=0" \
  --ostype      ubuntu \
  --unprivileged "$CT_UNPRIVILEGED" \
  --features    "nesting=1" \
  --onboot      "$CT_ONBOOT" \
  --timezone    "host" \
  >/dev/null 2>&1

msg_ok "Container created"

# ── Start container ───────────────────────────────────────────────────────────
msg_info "Starting container"
pct start "$CTID"

# Wait for network (up to 30s)
echo -n "${TAB}${YW}◉${CL} Waiting for network"
for _ in $(seq 1 30); do
  CT_IP=$(pct exec "$CTID" -- hostname -I 2>/dev/null | awk '{print $1}')
  [[ -n "$CT_IP" ]] && break
  printf "."; sleep 1
done
echo ""
[[ -n "$CT_IP" ]] || msg_error "Container did not get an IP. Check DHCP / bridge config."
msg_ok "Container running — IP: ${CT_IP}"

# ── Run install script inside container ───────────────────────────────────────
echo ""
echo -e "${TAB}${DGN}Container:${CL} ${CTID} on ${CT_STORAGE}"
echo -e "${TAB}${DGN}Resources:${CL} ${CT_CORES} vCPU, ${CT_RAM} MB RAM, ${CT_DISK} GB disk"
echo -e "${TAB}${DGN}Network:${CL}   ${CT_IP} via ${CT_BRIDGE}"
echo ""
msg_info "Installing AFL Crystalball (3-5 min first run)"
echo ""

pct exec "$CTID" -- bash -c "curl -fsSL ${INSTALL_SCRIPT} | bash" \
  || msg_error "Install script failed. Check container console: pct enter ${CTID}"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${TAB}${GN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo -e "${TAB}${GN} ${APP} deployed successfully!${CL}"
echo -e "${TAB}${GN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${CL}"
echo ""
echo -e "${TAB}${CY}App URL:${CL}    http://${CT_IP}"
echo -e "${TAB}${CY}Container:${CL}  pct enter ${CTID}"
echo -e "${TAB}${CY}Logs:${CL}       pct exec ${CTID} -- journalctl -u afl-backend -f"
echo ""
echo -e "${TAB}To update later, just re-run this script:"
echo -e "${TAB}${YW}bash <(curl -fsSL https://raw.githubusercontent.com/jockking/AFL-Crystalball/main/proxmox/ct/afl-crystalball.sh)${CL}"
echo ""
