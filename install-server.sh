#!/usr/bin/env bash
# Bootstrap Ubuntu 22.04 for NOSE GO! Party Edition static hosting.
# Run on the VM with sudo privileges (e.g. ubuntu user after gcp-setup.sh).
# First bring-up is HTTP on port 80 (static IP is fine). Add certbot TLS after DNS.

set -euo pipefail

log()  { printf '[install-server] %s\n' "$*"; }
fail() { printf '[install-server] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(id -u)" -ne 0 ]]; then
  fail "run as root (sudo ./install-server.sh)"
fi

export DEBIAN_FRONTEND=noninteractive

log "updating apt indexes"
apt-get update -y

log "installing nginx and certbot"
apt-get install -y --no-install-recommends \
  nginx \
  certbot \
  python3-certbot-nginx \
  rsync \
  curl \
  ca-certificates

log "creating docroot /var/www/nosego/dist"
mkdir -p /var/www/nosego/dist
chown -R www-data:www-data /var/www/nosego
chmod 755 /var/www/nosego /var/www/nosego/dist

# Placeholder page so nginx is healthy before the first deploy.
if [[ ! -f /var/www/nosego/dist/index.html ]]; then
  cat >/var/www/nosego/dist/index.html <<'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>NOSE GO!</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0f172a; color: #e2e8f0; }
    main { text-align: center; padding: 2rem; }
  </style>
</head>
<body>
  <main>
    <h1>NOSE GO!</h1>
    <p>Server is ready. Deploy the SPA build to replace this page.</p>
  </main>
</body>
</html>
HTML
  chown www-data:www-data /var/www/nosego/dist/index.html
fi

SITE_AVAILABLE=/etc/nginx/sites-available/nosego
SITE_ENABLED=/etc/nginx/sites-enabled/nosego
TEMPLATE_CANDIDATES=(
  "$(dirname "$(readlink -f "$0" 2>/dev/null || echo "$0")")/nginx.conf.template"
  ./nginx.conf.template
  /tmp/nginx.conf.template
)

TEMPLATE=""
for c in "${TEMPLATE_CANDIDATES[@]}"; do
  if [[ -f "${c}" ]]; then
    TEMPLATE="${c}"
    break
  fi
done

if [[ -n "${TEMPLATE}" ]]; then
  log "installing nginx site from ${TEMPLATE}"
  cp "${TEMPLATE}" "${SITE_AVAILABLE}"
else
  log "nginx.conf.template not found beside script; writing minimal SPA server"
  cat >"${SITE_AVAILABLE}" <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/nosego/dist;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX
fi

# Prefer nosego site; disable default site if present.
if [[ -L /etc/nginx/sites-enabled/default ]]; then
  log "disabling default nginx site"
  rm -f /etc/nginx/sites-enabled/default
fi
ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"

log "testing nginx configuration"
nginx -t
systemctl enable nginx
systemctl restart nginx

# --- firewall: UFW if present; otherwise remind about GCP VPC rules ---
if command -v ufw >/dev/null 2>&1; then
  log "configuring UFW for 22/80/443"
  ufw allow OpenSSH || ufw allow 22/tcp || true
  ufw allow 'Nginx Full' || { ufw allow 80/tcp || true; ufw allow 443/tcp || true; }
  # Do not force-enable UFW if the operator left it inactive; only ensure rules exist.
  if ufw status 2>/dev/null | grep -qi inactive; then
    log "UFW is inactive. To enable: ufw --force enable"
  fi
else
  log "ufw not installed; rely on GCP VPC firewall (tcp 22,80,443)"
fi

log "nginx is listening; HTTP on port 80 is enough for IP-only bring-up"
log "Public camera demos need HTTPS. After DNS points at this VM:"
log "  certbot --nginx -d your.domain.example"
log "  systemctl reload nginx"
log "Certbot packages are installed; do not run certbot against a bare IP for production certificates."
log "install-server complete"
