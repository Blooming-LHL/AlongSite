#!/usr/bin/env bash
# First-time setup for an Ubuntu server, run from its trusted web console as root.
# Creates only the AlongSite site and deployment account; never prints the private key.
set -euo pipefail
public_ip=${1:-42.193.226.154}
http_port=${2:-8081}
[[ "$http_port" =~ ^[0-9]{4,5}$ ]] && (( 10#$http_port >= 1024 && 10#$http_port <= 65535 )) || { echo 'Expected an HTTP port between 1024 and 65535' >&2; exit 2; }
[[ "$public_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || { echo 'Expected a public IPv4 address' >&2; exit 2; }
[[ $EUID -eq 0 ]] || { echo 'Run this script as root in the server web console.' >&2; exit 1; }
. /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 24.04 ]] || { echo 'This setup script targets Ubuntu 24.04.' >&2; exit 1; }
user=alongsite-deploy
root=/srv/alongsite-preview
state=/root/.alongsite-preview-setup
conf=/etc/nginx/sites-available/alongsite-preview
site=/etc/nginx/sites-enabled/alongsite-preview
if id "$user" >/dev/null 2>&1 && [[ ! -f "$state/managed-user" ]]; then
  echo 'An unmanaged alongsite-deploy account exists; no changes made.' >&2; exit 1
fi
if [[ -e "$root" && ! -f "$state/managed-user" ]]; then
  echo 'The deployment directory already exists; inspect it before setup.' >&2; exit 1
fi
# Avoid installing a competing HTTP server over an unrelated service.
if ss -H -ltnp "sport = :$http_port" | grep -q .; then
  if ! ss -H -ltnp "sport = :$http_port" | grep -q '"nginx"'; then
    echo "Port $http_port is occupied by another service; no changes made." >&2; exit 1
  fi
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y nginx openssh-client curl ca-certificates
install -d -m 700 "$state"
if ! id "$user" >/dev/null 2>&1; then
  useradd --create-home --user-group --shell /bin/bash "$user"
  # Disable password authentication for this new account; use its dedicated public key.
  usermod --password '*' "$user"
  touch "$state/managed-user"
fi
install -d -o "$user" -g "$user" -m 755 "$root" "$root/releases"
install -d -o "$user" -g "$user" -m 700 "/home/$user/.ssh"
if [[ ! -f "$state/github-actions-key" ]]; then
  ssh-keygen -q -t ed25519 -N '' -C github-actions-alongsite -f "$state/github-actions-key"
fi
chmod 600 "$state/github-actions-key"
public_line="restrict $(cat "$state/github-actions-key.pub")"
authorized="/home/$user/.ssh/authorized_keys"
touch "$authorized"
if ! grep -Fqx -- "$public_line" "$authorized"; then
  printf '%s\n' "$public_line" >> "$authorized"
fi
chown "$user:$user" "$authorized"
chmod 600 "$authorized"
# A package upgrade or socket-activated SSH service may leave this runtime directory absent.
# sshd validates it even for configuration inspection; creating it does not restart SSH.
install -d -o root -g root -m 755 /run/sshd
host_key=$(sshd -T | awk '$1 == "hostkey" && /ed25519/ && !found {print $2 ".pub"; found=1}')
[[ -n "$host_key" && -r "$host_key" ]] || { echo 'No configured Ed25519 SSH host public key found.' >&2; exit 1; }
awk -v host="$public_ip" '{print host " " $1 " " $2}' "$host_key" > "$state/github-known-hosts.txt"
# Verify this account and key locally; do not alter the existing SSH daemon configuration.
ssh -i "$state/github-actions-key" -o IdentitiesOnly=yes -o BatchMode=yes \
  -o StrictHostKeyChecking=yes -o "UserKnownHostsFile=$state/github-known-hosts.txt" \
  -o "HostKeyAlias=$public_ip" -o ConnectTimeout=5 "$user@127.0.0.1" \
  'test -w /srv/alongsite-preview' || { echo 'Deployment account login failed. Existing SSH settings were not changed.' >&2; exit 1; }
# Keep an already published site intact when the setup is run again.
if [[ ! -e "$root/current" && ! -L "$root/current" ]]; then
  install -d -o "$user" -g "$user" -m 755 "$root/releases/bootstrap"
  cat > "$root/releases/bootstrap/index.html" <<'HTML'
<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ALong · 预览环境</title><style>body{max-width:640px;margin:15vh auto;padding:24px;background:#f7f6f2;color:#242522;font:16px/1.8 sans-serif}h1{font-weight:500}p{color:#71726b}</style><h1>预览环境已准备好。</h1><p>完成 GitHub 自动部署配置后，这里将展示最新的博客。</p></html>
HTML
  chown "$user:$user" "$root/releases/bootstrap/index.html"
  chmod 644 "$root/releases/bootstrap/index.html"
  ln -s "$root/releases/bootstrap" "$root/current"
  chown -h "$user:$user" "$root/current"
fi
candidate=$(mktemp)
trap 'rm -f "$candidate"' EXIT
cat > "$candidate" <<NGINX
# Managed by AlongSite setup-preview-server.sh
server {
    listen $http_port;
    server_name $public_ip;
    root /srv/alongsite-preview/current;
    index index.html;

    # AlongSite profile routes
    location ~ ^/en/about/?$ { return 301 /; }
    location ~ ^/about/?$ { return 301 /cn/about; }
    location = /cn/about { try_files /cn/about/index.html =404; }
    location = /cn/about/ { return 301 /cn/about; }

    add_header Cache-Control "no-cache" always;
    location / { try_files \$uri \$uri/ =404; }
    location = /deployment.json {
        add_header Cache-Control "no-store" always;
        try_files \$uri =404;
    }
    error_page 404 /404.html;
}
NGINX
if [[ -e "$conf" ]] && ! cmp -s "$candidate" "$conf"; then
  echo 'A different AlongSite Nginx configuration exists; use scripts/set-preview-port.sh to change its port.' >&2; exit 1
fi
install -m 644 "$candidate" "$conf"
if [[ -e "$site" || -L "$site" ]]; then
  [[ -L "$site" && "$(readlink -f "$site")" == "$conf" ]] || { echo 'An unrelated enabled site uses this name.' >&2; exit 1; }
else
  ln -s "$conf" "$site"
fi
nginx -t
systemctl enable nginx
systemctl start nginx
systemctl reload nginx
if command -v ufw >/dev/null 2>&1 && LC_ALL=C ufw status | grep -q '^Status: active'; then
  ufw allow "$http_port/tcp" comment 'AlongSite HTTP preview'
fi
curl --fail --silent --show-error --max-time 10 -H "Host: $public_ip" "http://127.0.0.1:$http_port/" -o /dev/null
printf '\nSETUP_OK\nPreview: http://%s:%s/\nDeploy user: %s\n' "$public_ip" "$http_port" "$user"
printf 'Private key saved at: %s/github-actions-key (do not send its contents to chat)\n' "$state"
printf 'Known hosts saved at: %s/github-known-hosts.txt\n' "$state"
printf 'Next: add GitHub Actions Secrets and Variables, and allow TCP %s in the Tencent Cloud firewall.\n' "$http_port"
