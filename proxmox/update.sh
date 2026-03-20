#!/usr/bin/env bash
# =============================================================================
# AFL Crystalball — Update Script
# =============================================================================
# Pulls the latest code from GitHub and rebuilds the Docker containers.
# Run this script ON THE PROXMOX HOST as root.
#
# Usage:
#   sudo bash proxmox/update.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STATE_FILE="$SCRIPT_DIR/.deploy-state"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}  ✓${NC}  $*"; }
step()  { echo -e "\n${CYAN}▶${NC}  $*"; }
err()   { echo -e "\n${RED}  ✗  $*${NC}" >&2; exit 1; }

# =============================================================================
# ── LOAD DEPLOY STATE ─────────────────────────────────────────────────────────
# =============================================================================

[[ -f "$STATE_FILE" ]] \
    || err "No deploy state found at $STATE_FILE\n  Run deploy.sh first."

# shellcheck disable=SC1090
source "$STATE_FILE"

echo ""
echo -e "${CYAN}AFL Crystalball — Update${NC}"
echo -e "  VM:   $VM_NAME  (ID $VM_ID)"
echo -e "  IP:   $VM_IP"
echo -e "  Last: ${DEPLOYED_AT:-unknown}"
echo ""

# =============================================================================
# ── CHECK VM IS RUNNING ───────────────────────────────────────────────────────
# =============================================================================

step "Checking VM status"

VM_STATUS=$(qm status "$VM_ID" 2>/dev/null | awk '{print $2}' || true)
if [[ "$VM_STATUS" != "running" ]]; then
    echo -e "  VM is $VM_STATUS. Starting it..."
    qm start "$VM_ID"
    echo -n "  Waiting for VM"
    until qm agent "$VM_ID" ping >/dev/null 2>&1; do
        printf "."; sleep 3
    done
    echo ""
    # Give SSH a moment after guest agent is up
    sleep 5
fi
info "VM is running."

# =============================================================================
# ── CHECK SSH CONNECTIVITY ────────────────────────────────────────────────────
# =============================================================================

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=8 -o BatchMode=yes -i $SSH_KEY_PATH"

ssh $SSH_OPTS "${VM_USERNAME}@${VM_IP}" "exit 0" 2>/dev/null \
    || err "Cannot SSH to $VM_IP.\n  The VM may have a new IP (DHCP). Run deploy.sh to redeploy, or check Proxmox DHCP leases."

info "SSH connection confirmed."

# =============================================================================
# ── PULL + REBUILD ────────────────────────────────────────────────────────────
# =============================================================================

step "Pulling latest code from GitHub"

# shellcheck disable=SC2087
ssh $SSH_OPTS "${VM_USERNAME}@${VM_IP}" "bash -s" << REMOTE
set -euo pipefail

cd $APP_DIR

echo "--- Current version ---"
git log --oneline -3

echo ""
echo "--- Pulling latest ---"
git pull --ff-only

echo ""
echo "--- Rebuilding containers ---"
sudo docker compose up -d --build --remove-orphans

echo ""
echo "--- Pruning unused images ---"
sudo docker image prune -f

echo ""
echo "--- Container status ---"
sudo docker compose ps
REMOTE

# =============================================================================
# ── UPDATE STATE FILE ─────────────────────────────────────────────────────────
# =============================================================================

# Update the deployed timestamp
sed -i "s/^DEPLOYED_AT=.*/DEPLOYED_AT=$(date -u "+%Y-%m-%d %H:%M UTC")/" "$STATE_FILE"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Update complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}App URL:${NC}  http://${VM_IP}"
echo ""
