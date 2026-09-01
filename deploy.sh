#!/usr/bin/env bash
# Deploy NOSE GO! Party Edition static build to the nginx docroot on the VM.
# Required env:
#   DEPLOY_HOST  - hostname or IP (e.g. static IP from gcp-setup)
#   DEPLOY_USER  - SSH user on the VM
#   SSH_KEY      - path to private key (or raw key material handled by caller via file)
#
# Usage:
#   DEPLOY_HOST=x.x.x.x DEPLOY_USER=ubuntu SSH_KEY=~/.ssh/id_rsa ./deploy.sh
#   ./deploy.sh /path/to/dist

set -euo pipefail

log()  { printf '[deploy] %s\n' "$*"; }
fail() { printf '[deploy] ERROR: %s\n' "$*" >&2; exit 1; }

log "starting verbose deploy"

: "${DEPLOY_HOST:?DEPLOY_HOST is required}"
: "${DEPLOY_USER:?DEPLOY_USER is required}"
: "${SSH_KEY:?SSH_KEY is required (path to private key file)}"

DIST_DIR="${1:-dist}"
REMOTE_ROOT="/var/www/nosego"
REMOTE_DIST="${REMOTE_ROOT}/dist"
SSH_OPTS=(
  -i "${SSH_KEY}"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=accept-new
  -o ServerAliveInterval=30
)

if [[ ! -f "${SSH_KEY}" ]]; then
  fail "SSH_KEY file not found: ${SSH_KEY}"
fi

if [[ ! -d "${DIST_DIR}" ]]; then
  fail "build directory not found: ${DIST_DIR} (run npm run build first)"
fi

if [[ ! -f "${DIST_DIR}/index.html" ]]; then
  fail "no index.html in ${DIST_DIR}; refusing to deploy empty or incomplete build"
fi

log "DEPLOY_HOST=${DEPLOY_HOST}"
log "DEPLOY_USER=${DEPLOY_USER}"
log "DIST_DIR=${DIST_DIR}"
log "REMOTE_DIST=${REMOTE_DIST}"

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

log "ensuring remote directories exist"
ssh "${SSH_OPTS[@]}" "${REMOTE}" \
  "sudo mkdir -p '${REMOTE_DIST}' && sudo chown -R '${DEPLOY_USER}:${DEPLOY_USER}' '${REMOTE_ROOT}'"

# Prefer rsync when available for delete-stale and fewer round trips; fall back to scp.
if command -v rsync >/dev/null 2>&1; then
  log "uploading via rsync"
  rsync -avz --delete \
    -e "ssh $(printf '%q ' "${SSH_OPTS[@]}")" \
    "${DIST_DIR}/" \
    "${REMOTE}:${REMOTE_DIST}/"
else
  log "rsync not found; uploading via scp (no remote prune)"
  ssh "${SSH_OPTS[@]}" "${REMOTE}" "rm -rf '${REMOTE_DIST:?}/'* '${REMOTE_DIST}'/.[!.]* 2>/dev/null || true"
  scp -r "${SSH_OPTS[@]}" "${DIST_DIR}/." "${REMOTE}:${REMOTE_DIST}/"
fi

log "fixing ownership for nginx and reloading"
ssh "${SSH_OPTS[@]}" "${REMOTE}" bash -s <<'REMOTE'
set -euo pipefail
sudo chown -R www-data:www-data /var/www/nosego/dist
sudo find /var/www/nosego/dist -type d -exec chmod 755 {} \;
sudo find /var/www/nosego/dist -type f -exec chmod 644 {} \;
if command -v nginx >/dev/null 2>&1; then
  sudo nginx -t
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl reload nginx
  else
    sudo nginx -s reload
  fi
  echo "[remote] nginx reloaded"
else
  echo "[remote] WARNING: nginx not installed; files copied only" >&2
fi
REMOTE

log "deploy complete -> http://${DEPLOY_HOST}/"
