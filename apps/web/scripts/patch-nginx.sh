#!/bin/bash
# Patch the 80-port nginx vhost for 175.24.134.228 so /downloads/ and /
# serve the PlainList download page as static files, instead of being
# reverse-proxied to the dead 127.0.0.1:3000.
#
# Approach: download the vhost, patch it locally, upload it back, then
# test + reload nginx.

set -euo pipefail

SERVER="${PLAINLIST_SERVER:-ubuntu@175.24.134.228}"
REMOTE_VHOST="/www/server/panel/vhost/nginx/175.24.134.228.conf"

SSH_OPTS=(-o BatchMode=yes -o PreferredAuthentications=publickey -o PasswordAuthentication=no -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
LOCAL_VHOST="${WORK}/vhost.conf"
LOCAL_PATCHED="${WORK}/vhost.patched.conf"

echo "[patch] fetching ${REMOTE_VHOST} (via sudo)..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n cat '${REMOTE_VHOST}'" > "${LOCAL_VHOST}"
ls -la "${LOCAL_VHOST}"
head -5 "${LOCAL_VHOST}"

# backup on the server
echo "[patch] backing up remote vhost..."
ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n cp '${REMOTE_VHOST}' '${REMOTE_VHOST}.bak-$(date +%Y%m%d-%H%M%S)'"

# build the patch block
cat > "${WORK}/patch.conf" <<'PATCH_EOF'
    # ── PlainList download page (inserted by deploy-dmg.sh) ─────────
    location = / {
        return 308 https://plainlist.space/download;
    }
    location = /index.html {
        return 308 https://plainlist.space/download;
    }
    location ^~ /downloads/ {
        root /www/wwwroot/175.24.134.228;
        autoindex off;
        add_header Cache-Control "public, max-age=3600" always;
    }
    location = /favicon.ico {
        root /www/wwwroot/175.24.134.228;
        try_files /favicon.ico =404;
        access_log off;
        expires 7d;
    }
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
    # ── end PlainList ──────────────────────────────────────────────
PATCH_EOF

# insert before "location ^~ /" using python
python3 - "${LOCAL_VHOST}" "${WORK}/patch.conf" "${LOCAL_PATCHED}" <<'PY_EOF'
import sys, pathlib
vhost_path, patch_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
text = pathlib.Path(vhost_path).read_text()
patch = pathlib.Path(patch_path).read_text()
marker = "location ^~ /"
idx = text.find(marker)
if idx == -1:
    raise SystemExit(f'marker not found: {marker!r}')
new_text = text[:idx] + patch + text[idx:]
pathlib.Path(out_path).write_text(new_text)
print(f'patched, +{len(patch)} bytes at offset {idx}')
PY_EOF

# upload
echo "[patch] uploading patched vhost..."
scp "${SSH_OPTS[@]}" "${LOCAL_PATCHED}" "$SERVER:/tmp/vhost.patched.conf"

ssh "${SSH_OPTS[@]}" "$SERVER" \
  "sudo -n mv /tmp/vhost.patched.conf '${REMOTE_VHOST}' && \
   sudo -n chown root:root '${REMOTE_VHOST}' && \
   sudo -n /www/server/nginx/sbin/nginx -t 2>&1 && \
   sudo -n /www/server/nginx/sbin/nginx -s reload 2>&1 && \
   echo reload_ok"

echo "[patch] done."
