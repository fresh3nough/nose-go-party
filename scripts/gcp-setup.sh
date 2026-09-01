#!/usr/bin/env bash
# Provision GCP resources for NOSE GO! Party Edition (idempotent checks).
# Requires: gcloud authenticated with a project that can create Compute resources.
#
# Creates / ensures:
#   - Compute Engine API
#   - Regional static IP  nose-go-ip   (us-central1)
#   - VM                 nose-go-vm   (e2-medium, Ubuntu 22.04, 20GB, us-central1-a)
#   - Firewall rules     tcp:22,80,443 (nose-go-allow-*)
#   - Static IP attached to VM access config
#
# Usage:
#   ./scripts/gcp-setup.sh
#   GCP_PROJECT=my-project ./scripts/gcp-setup.sh

set -euo pipefail

log()  { printf '[gcp-setup] %s\n' "$*"; }
fail() { printf '[gcp-setup] ERROR: %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null 2>&1 || fail "gcloud CLI not found"

PROJECT="${GCP_PROJECT:-$(gcloud config get-value project 2>/dev/null || true)}"
[[ -n "${PROJECT}" && "${PROJECT}" != "(unset)" ]] || fail "set a project: gcloud config set project PROJECT_ID or GCP_PROJECT=..."

REGION="us-central1"
ZONE="us-central1-a"
IP_NAME="nose-go-ip"
VM_NAME="nose-go-vm"
MACHINE="e2-medium"
DISK_GB=20
IMAGE_FAMILY="ubuntu-2204-lts"
IMAGE_PROJECT="ubuntu-os-cloud"
NETWORK="default"
TAGS="nose-go,http-server,https-server"

log "project=${PROJECT} region=${REGION} zone=${ZONE}"
gcloud config set project "${PROJECT}"

log "enabling compute.googleapis.com"
gcloud services enable compute.googleapis.com --project="${PROJECT}"

# --- static IP ---
if gcloud compute addresses describe "${IP_NAME}" --region="${REGION}" --project="${PROJECT}" >/dev/null 2>&1; then
  log "static IP ${IP_NAME} already exists"
else
  log "creating static IP ${IP_NAME}"
  gcloud compute addresses create "${IP_NAME}" \
    --project="${PROJECT}" \
    --region="${REGION}" \
    --network-tier=PREMIUM
fi

STATIC_IP="$(gcloud compute addresses describe "${IP_NAME}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --format='get(address)')"
log "STATIC_IP=${STATIC_IP}"

# --- firewall ---
ensure_fw() {
  local name="$1"
  local ports="$2"
  if gcloud compute firewall-rules describe "${name}" --project="${PROJECT}" >/dev/null 2>&1; then
    log "firewall ${name} already exists"
  else
    log "creating firewall ${name} (tcp:${ports})"
    gcloud compute firewall-rules create "${name}" \
      --project="${PROJECT}" \
      --network="${NETWORK}" \
      --allow="tcp:${ports}" \
      --target-tags=nose-go \
      --direction=INGRESS \
      --priority=1000 \
      --description="NOSE GO! allow tcp ${ports}"
  fi
}

ensure_fw "nose-go-allow-ssh"  "22"
ensure_fw "nose-go-allow-http" "80"
ensure_fw "nose-go-allow-https" "443"

# --- VM ---
if gcloud compute instances describe "${VM_NAME}" --zone="${ZONE}" --project="${PROJECT}" >/dev/null 2>&1; then
  log "VM ${VM_NAME} already exists"
else
  log "creating VM ${VM_NAME} (${MACHINE}, ${DISK_GB}GB, ${IMAGE_FAMILY})"
  gcloud compute instances create "${VM_NAME}" \
    --project="${PROJECT}" \
    --zone="${ZONE}" \
    --machine-type="${MACHINE}" \
    --network-interface="network-tier=PREMIUM,address=${STATIC_IP},network=${NETWORK}" \
    --tags="${TAGS}" \
    --create-disk="auto-delete=yes,boot=yes,device-name=${VM_NAME},image-family=${IMAGE_FAMILY},image-project=${IMAGE_PROJECT},mode=rw,size=${DISK_GB},type=pd-balanced" \
    --metadata=enable-oslogin=TRUE \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --provisioning-model=STANDARD
fi

# Attach / refresh access config to the reserved IP if needed
log "ensuring external IP ${STATIC_IP} is associated"
CURRENT_IP="$(gcloud compute instances describe "${VM_NAME}" \
  --project="${PROJECT}" \
  --zone="${ZONE}" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)' 2>/dev/null || true)"

if [[ "${CURRENT_IP}" == "${STATIC_IP}" ]]; then
  log "VM already has ${STATIC_IP}"
else
  # Remove existing access config if present, then add static address
  AC_NAME="$(gcloud compute instances describe "${VM_NAME}" \
    --project="${PROJECT}" \
    --zone="${ZONE}" \
    --format='get(networkInterfaces[0].accessConfigs[0].name)' 2>/dev/null || true)"
  if [[ -n "${AC_NAME}" ]]; then
    log "removing access config ${AC_NAME} (current IP ${CURRENT_IP:-none})"
    gcloud compute instances delete-access-config "${VM_NAME}" \
      --project="${PROJECT}" \
      --zone="${ZONE}" \
      --access-config-name="${AC_NAME}" \
      || true
  fi
  log "adding access config with ${STATIC_IP}"
  gcloud compute instances add-access-config "${VM_NAME}" \
    --project="${PROJECT}" \
    --zone="${ZONE}" \
    --access-config-name="External NAT" \
    --address="${STATIC_IP}"
fi

log "waiting for VM RUNNING"
gcloud compute instances describe "${VM_NAME}" \
  --project="${PROJECT}" \
  --zone="${ZONE}" \
  --format='get(status)'

cat <<EOF

[gcp-setup] complete

  Project : ${PROJECT}
  VM      : ${VM_NAME} (${ZONE})
  Machine : ${MACHINE}
  Disk    : ${DISK_GB} GB
  Image   : ${IMAGE_FAMILY}
  IP name : ${IP_NAME}
  IP addr : ${STATIC_IP}

SSH (OS Login or project SSH keys):
  gcloud compute ssh ${VM_NAME} --zone ${ZONE} --project ${PROJECT}

After SSH:
  # copy install-server.sh and nginx.conf.template to the VM, then:
  sudo ./install-server.sh

GitHub Actions secrets:
  STATIC_IP   = ${STATIC_IP}
  DEPLOY_USER = ubuntu   # or your OS Login / SSH user
  GCP_SSH_KEY = (private key whose public half is authorized on the VM)

Manual deploy:
  DEPLOY_HOST=${STATIC_IP} DEPLOY_USER=ubuntu SSH_KEY=~/.ssh/id_rsa ./deploy.sh

EOF
