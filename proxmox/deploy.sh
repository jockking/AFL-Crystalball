#!/usr/bin/env bash
# =============================================================================
# AFL Crystalball — Proxmox VM Deployment Script
# =============================================================================
# Creates a Ubuntu 22.04 VM on your Proxmox host and deploys the app.
# Run this script ON THE PROXMOX HOST as root.
#
# One-liner (run directly from GitHub):
#   bash <(curl -fsSL https://raw.githubusercontent.com/jockking/AFL-Crystalball/main/proxmox/deploy.sh)
#
# Or clone first:
#   bash proxmox/deploy.sh
#
# Requirements:
#   - Run as root on the Proxmox host
#   - Internet access from the Proxmox host (to download the cloud image)
#   - Internet access from the VM (to clone the repo and pull Docker images)
# =============================================================================
set -euo pipefail

# =============================================================================
# ── CONFIGURATION — edit these to match your environment ──────────────────────
# =============================================================================

VM_NAME="afl-crystalball"
VM_MEMORY=2048          # RAM in MB
VM_CORES=2
VM_DISK_SIZE="20G"
VM_BRIDGE="vmbr0"       # Proxmox network bridge (check: ip link | grep vmbr)
VM_STORAGE="local-lvm"  # Storage pool for VM disk — common values:
                        #   local-lvm  (LVM-thin, most common default)
                        #   local      (directory-based)
                        #   local-zfs  (ZFS pool)
                        # Check yours: pvesm status

GITHUB_REPO="https://github.com/jockking/AFL-Crystalball.git"
APP_DIR="/opt/afl-crystalball"
VM_USERNAME="ubuntu"

# Ubuntu 22.04 (Jammy) minimal cloud image
CLOUD_IMAGE_URL="https://cloud-images.ubuntu.com/jammy/current/jammy-server-cloudimg-amd64.img"
CLOUD_IMAGE_CACHE="/var/lib/vz/template/iso/jammy-server-cloudimg-amd64.img"

# SSH key used to talk to the VM (generated automatically if absent)
SSH_KEY_PATH="$HOME/.ssh/afl_crystalball_deploy"

# State file — fixed path so the script works whether run locally or via curl pipe
STATE_FILE="/root/.afl-crystalball-state"

# =============================================================================
# ── HELPERS ───────────────────────────────────────────────────────────────────
# =============================================================================

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}  ✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}  !${NC}  $*"; }
step()  { echo -e "\n${CYAN}▶${NC}  $*"; }
err()   { echo -e "\n${RED}  ✗  $*${NC}" >&2; exit 1; }

# =============================================================================
# ── PREFLIGHT ─────────────────────────────────────────────────────────────────
# =============================================================================

step "Preflight checks"

[[ $EUID -eq 0 ]]                           || err "Must be run as root. Try: sudo bash proxmox/deploy.sh"
command -v qm    >/dev/null 2>&1            || err "'qm' not found — this script must run on the Proxmox host."
command -v pvesh >/dev/null 2>&1            || err "'pvesh' not found — this script must run on the Proxmox host."
command -v wget  >/dev/null 2>&1            || err "'wget' not found. Install: apt-get install wget"
command -v python3 >/dev/null 2>&1          || err "'python3' not found."

info "Running on Proxmox host."

# Verify the storage pool exists
pvesh get /storage/"$VM_STORAGE" --output-format json >/dev/null 2>&1 \
    || err "Storage '$VM_STORAGE' not found. Check: pvesm status\n  Then set VM_STORAGE in this script."
info "Storage '$VM_STORAGE' confirmed."

# =============================================================================
# ── SSH DEPLOY KEY ────────────────────────────────────────────────────────────
# =============================================================================

step "SSH deploy key"

if [[ ! -f "$SSH_KEY_PATH" ]]; then
    ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -C "afl-crystalball-deploy" -q
    info "Generated new deploy key: $SSH_KEY_PATH"
else
    info "Reusing existing key: $SSH_KEY_PATH"
fi

SSH_PUB_KEY=$(cat "${SSH_KEY_PATH}.pub")

# =============================================================================
# ── EXISTING VM CHECK ─────────────────────────────────────────────────────────
# =============================================================================

step "Checking for existing VM"

EXISTING_ID=$(qm list 2>/dev/null | awk -v name="$VM_NAME" '$2 == name {print $1}' | head -1)
if [[ -n "$EXISTING_ID" ]]; then
    warn "VM '$VM_NAME' (ID $EXISTING_ID) already exists."
    echo ""
    read -rp "    Destroy it and redeploy from scratch? [y/N] " confirm
    [[ "$confirm" =~ ^[Yy]$ ]] || { echo "  Aborted. To update an existing deploy, run: bash proxmox/update.sh"; exit 0; }
    echo ""
    step "Destroying existing VM $EXISTING_ID"
    qm stop  "$EXISTING_ID" --skiplock 1 2>/dev/null || true
    sleep 4
    qm destroy "$EXISTING_ID" --purge 1 2>/dev/null || true
    info "VM $EXISTING_ID destroyed."
fi

# =============================================================================
# ── ALLOCATE VM ID ────────────────────────────────────────────────────────────
# =============================================================================

VM_ID=$(pvesh get /cluster/nextid 2>/dev/null)
[[ -n "$VM_ID" ]] || err "Could not allocate a VM ID."
info "VM ID: $VM_ID"

# =============================================================================
# ── CLOUD IMAGE ───────────────────────────────────────────────────────────────
# =============================================================================

step "Cloud image (Ubuntu 22.04)"

if [[ ! -f "$CLOUD_IMAGE_CACHE" ]]; then
    info "Downloading Ubuntu 22.04 cloud image (~600 MB)..."
    mkdir -p "$(dirname "$CLOUD_IMAGE_CACHE")"
    wget --progress=bar:force -O "$CLOUD_IMAGE_CACHE" "$CLOUD_IMAGE_URL" 2>&1 \
        || { rm -f "$CLOUD_IMAGE_CACHE"; err "Download failed."; }
else
    info "Using cached image: $CLOUD_IMAGE_CACHE"
fi

# =============================================================================
# ── CREATE VM ─────────────────────────────────────────────────────────────────
# =============================================================================

step "Creating VM $VM_ID ($VM_NAME)"

qm create "$VM_ID" \
    --name     "$VM_NAME" \
    --memory   "$VM_MEMORY" \
    --cores    "$VM_CORES" \
    --net0     "virtio,bridge=$VM_BRIDGE" \
    --ostype   l26 \
    --machine  q35 \
    --agent    "enabled=1,fstrim_cloned_disks=1" \
    --serial0  socket \
    --vga      serial0

info "VM shell created."

# Import cloud image as the boot disk
step "Importing disk"
qm importdisk "$VM_ID" "$CLOUD_IMAGE_CACHE" "$VM_STORAGE" 2>&1 | tail -1
qm set "$VM_ID" \
    --scsihw virtio-scsi-pci \
    --scsi0  "${VM_STORAGE}:vm-${VM_ID}-disk-0" \
    --ide2   "${VM_STORAGE}:cloudinit" \
    --boot   "order=scsi0"

# Grow disk to configured size
qm resize "$VM_ID" scsi0 "$VM_DISK_SIZE"
info "Disk: $VM_DISK_SIZE on $VM_STORAGE."

# =============================================================================
# ── CLOUD-INIT ────────────────────────────────────────────────────────────────
# =============================================================================

step "Configuring cloud-init"

# cloud-init snippet — installs qemu-guest-agent on first boot so we can
# query the VM's IP address without needing to know it in advance
SNIPPET_DIR="/var/lib/vz/snippets"
SNIPPET_FILE="$SNIPPET_DIR/afl-crystalball-init.yml"
mkdir -p "$SNIPPET_DIR"

cat > "$SNIPPET_FILE" << 'SNIPPET'
#cloud-config
package_update: true
packages:
  - qemu-guest-agent
runcmd:
  - systemctl enable --now qemu-guest-agent
SNIPPET

# Write SSH public key to temp file (qm sshkeys requires a file path)
SSH_KEY_TMP=$(mktemp)
echo "$SSH_PUB_KEY" > "$SSH_KEY_TMP"

qm set "$VM_ID" \
    --ciuser    "$VM_USERNAME" \
    --sshkeys   "$SSH_KEY_TMP" \
    --ipconfig0 "ip=dhcp" \
    --nameserver "8.8.8.8 1.1.1.1" \
    --cicustom  "user=local:snippets/afl-crystalball-init.yml"

rm -f "$SSH_KEY_TMP"
info "Cloud-init configured (DHCP, SSH key, qemu-guest-agent on first boot)."

# =============================================================================
# ── START VM ──────────────────────────────────────────────────────────────────
# =============================================================================

step "Starting VM"
qm start "$VM_ID"
info "VM started."

# Wait for qemu-guest-agent (cloud-init installs it, then it starts)
echo -n "    Waiting for guest agent (this can take 60–120s on first boot)"
TIMEOUT=180
ELAPSED=0
until qm agent "$VM_ID" ping >/dev/null 2>&1; do
    sleep 3; ELAPSED=$((ELAPSED + 3))
    printf "."
    [[ $ELAPSED -ge $TIMEOUT ]] && echo "" && err \
        "Timed out waiting for guest agent.\n  Check the VM console in Proxmox UI (VM $VM_ID).\n  Cloud-init may still be running — wait a minute and try again."
done
echo ""
info "Guest agent is up."

# =============================================================================
# ── GET VM IP ─────────────────────────────────────────────────────────────────
# =============================================================================

step "Getting VM IP address"
VM_IP=""
for _ in $(seq 1 20); do
    VM_IP=$(qm agent "$VM_ID" network-get-interfaces 2>/dev/null \
        | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    ifaces = data.get('result', data) if isinstance(data, dict) else data
    for iface in ifaces:
        if iface.get('name', '') == 'lo':
            continue
        for addr in iface.get('ip-addresses', []):
            ip = addr.get('ip-address', '')
            if addr.get('ip-address-type') == 'ipv4' and not ip.startswith('127.'):
                print(ip)
                sys.exit(0)
except Exception as e:
    pass
" 2>/dev/null || true)
    [[ -n "$VM_IP" ]] && break
    sleep 3
done

[[ -n "$VM_IP" ]] || err "Could not determine VM IP. Check DHCP and try again."
info "VM IP: $VM_IP"

# =============================================================================
# ── WAIT FOR SSH ──────────────────────────────────────────────────────────────
# =============================================================================

step "Waiting for SSH"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=5 -o BatchMode=yes -i $SSH_KEY_PATH"
echo -n "    "
for _ in $(seq 1 30); do
    ssh $SSH_OPTS "${VM_USERNAME}@${VM_IP}" "exit 0" 2>/dev/null && break
    printf "."; sleep 4
done
echo ""
ssh $SSH_OPTS "${VM_USERNAME}@${VM_IP}" "exit 0" 2>/dev/null \
    || err "SSH is not available. Check the VM console."
info "SSH ready."

# =============================================================================
# ── INSTALL DOCKER + DEPLOY ───────────────────────────────────────────────────
# =============================================================================

step "Installing Docker and deploying application"
info "This will take a few minutes (Docker install + image build)..."

# shellcheck disable=SC2087
ssh $SSH_OPTS "${VM_USERNAME}@${VM_IP}" "bash -s" << REMOTE
set -euo pipefail

echo ""
echo "==> Updating system packages"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get update -q
sudo apt-get upgrade -y -q

echo ""
echo "==> Installing git"
sudo apt-get install -y -q git ca-certificates curl gnupg

echo ""
echo "==> Installing Docker Engine"
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=\$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu \
\$(. /etc/os-release && echo \"\$VERSION_CODENAME\") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update -q
sudo apt-get install -y -q \
    docker-ce docker-ce-cli containerd.io \
    docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $VM_USERNAME
sudo systemctl enable --now docker
echo "Docker installed: \$(sudo docker --version)"

echo ""
echo "==> Cloning repository"
sudo git clone $GITHUB_REPO $APP_DIR
sudo chown -R $VM_USERNAME:$VM_USERNAME $APP_DIR

echo ""
echo "==> Building and starting application (first build takes 3–5 minutes)"
cd $APP_DIR
sudo docker compose up -d --build

echo ""
echo "==> Container status"
sudo docker compose ps
REMOTE

# =============================================================================
# ── SAVE STATE + PRINT SUMMARY ────────────────────────────────────────────────
# =============================================================================

cat > "$STATE_FILE" << STATE
VM_ID=$VM_ID
VM_IP=$VM_IP
VM_NAME=$VM_NAME
VM_USERNAME=$VM_USERNAME
APP_DIR=$APP_DIR
SSH_KEY_PATH=$SSH_KEY_PATH
DEPLOYED_AT=$(date -u "+%Y-%m-%d %H:%M UTC")
STATE

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Deployment complete!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${CYAN}App URL:${NC}     http://${VM_IP}"
echo -e "  ${CYAN}SSH:${NC}         ssh -i ${SSH_KEY_PATH} ${VM_USERNAME}@${VM_IP}"
echo -e "  ${CYAN}VM ID:${NC}       $VM_ID  (Proxmox: qm status $VM_ID)"
echo ""
echo -e "  ${CYAN}To update:${NC}   bash <(curl -fsSL https://raw.githubusercontent.com/jockking/AFL-Crystalball/main/proxmox/update.sh)"
echo -e "  ${CYAN}To stop:${NC}     qm stop $VM_ID"
echo -e "  ${CYAN}To start:${NC}    qm start $VM_ID"
echo ""
