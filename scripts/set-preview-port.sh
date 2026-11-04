#!/usr/bin/env bash
# Change only the existing AlongSite Nginx listener. Sourceable for renderer tests.
set -euo pipefail
validate_preview_port() {
  local port=$1
  [[ "$port" =~ ^[0-9]{4,5}$ ]] && (( 10#$port >= 1024 && 10#$port <= 65535 )) || {
    echo 'Expected a port between 1024 and 65535' >&2; return 2;
  }
}
render_preview_port() {
  local source=$1 destination=$2 port=$3
  validate_preview_port "$port" || return
  grep -Fxq '# Managed by AlongSite setup-preview-server.sh' "$source" &&
    grep -Eq '^[[:space:]]*root[[:space:]]+/srv/alongsite-preview/current;' "$source" || {
      echo 'Refusing to change an unmanaged Nginx site' >&2; return 1;
    }
  [[ $(grep -Ec '^[[:space:]]*listen[[:space:]]' "$source") == 1 ]] &&
    grep -Eq '^[[:space:]]*listen[[:space:]]+[0-9]+;[[:space:]]*$' "$source" || {
      echo 'Expected exactly one numeric AlongSite listener' >&2; return 1;
    }
  sed -E "s/^([[:space:]]*listen[[:space:]]+)[0-9]+;[[:space:]]*$/\1$port;/" "$source" > "$destination"
}
main() {
  local port=${1:-8081}
  validate_preview_port "$port"
  [[ $EUID -eq 0 ]] || { echo 'Run this script as root in the server web console.' >&2; return 1; }
  command -v nginx >/dev/null && command -v ss >/dev/null || { echo 'Nginx setup has not completed.' >&2; return 1; }
  preview_conf=/etc/nginx/sites-available/alongsite-preview
  [[ -f "$preview_conf" ]] || { echo 'AlongSite Nginx configuration is missing.' >&2; return 1; }
  candidate=$(mktemp /etc/nginx/sites-available/.alongsite-preview.new.XXXXXX)
  backup=''
  applied=false
  committed=false
  cleanup() {
    if [[ "$applied" == true && "$committed" != true ]]; then
      cp -p -- "$backup" "$preview_conf"
      if nginx -t; then systemctl reload nginx || true; fi
      echo "Port change did not complete; original config restored. Backup: $backup" >&2
    fi
    rm -f -- "$candidate"
  }
  trap cleanup EXIT
  render_preview_port "$preview_conf" "$candidate" "$port"
  local current_port
  current_port=$(awk '$1 == "listen" {gsub(/;/,"",$2); print $2}' "$preview_conf")
  if [[ "$current_port" != "$port" ]] && [[ -n "$(ss -H -ltn "sport = :$port")" ]]; then
    echo "Port $port is already occupied; no changes made." >&2; return 1
  fi
  backup=$(mktemp /etc/nginx/sites-available/.alongsite-preview.backup.XXXXXX)
  cp -p -- "$preview_conf" "$backup"
  chmod 644 "$candidate"
  mv -f -- "$candidate" "$preview_conf"
  applied=true
  nginx -t
  systemctl reload nginx
  if command -v ufw >/dev/null 2>&1 && LC_ALL=C ufw status | grep -q '^Status: active'; then
    ufw allow "$port/tcp" comment 'AlongSite HTTP preview'
  fi
  local host
  host=$(awk '$1 == "server_name" {gsub(/;/,"",$2); print $2; exit}' "$preview_conf")
  curl --fail --silent --show-error --max-time 10 -H "Host: $host" "http://127.0.0.1:$port/" -o /dev/null
  committed=true
  printf '\nPORT_UPDATED\nPreview: http://%s:%s/\nBackup: %s\n' "$host" "$port" "$backup"
  printf 'Allow TCP %s in the Tencent Cloud firewall and update PERSONAL_PREVIEW_URL. SSH stays on port 22.\n' "$port"
}
if [[ ${BASH_SOURCE[0]} == "$0" ]]; then main "$@"; fi
