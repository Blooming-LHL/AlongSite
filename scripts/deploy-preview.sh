#!/usr/bin/env bash
# Run on the destination server as the deployment user. No sudo is required.
set -euo pipefail
if [[ $# != 3 ]]; then
  echo 'Usage: deploy-preview.sh ARCHIVE DEPLOY_ROOT COMMIT_SHA' >&2
  exit 2
fi
archive=$1
root=$2
revision=$3
[[ "$root" == /* && "$root" != / && "$root" != *'/../'* && "$root" != */.. ]] || { echo 'Invalid deployment directory' >&2; exit 2; }
[[ "$revision" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid commit SHA' >&2; exit 2; }
[[ -f "$archive" && -d "$root" && -w "$root" ]] || { echo 'Archive missing, or deployment directory is not writable' >&2; exit 1; }
[[ ! -e "$root/current" || -L "$root/current" ]] || { echo 'Refusing to replace an existing current directory' >&2; exit 1; }
mkdir -p "$root/releases"
staging=$(mktemp -d "$root/releases/.staging.XXXXXX")
link="$root/.current.$$"
cleanup() {
  [[ -z "$staging" ]] || rm -rf -- "$staging"
  rm -f -- "$link"
}
trap cleanup EXIT
# Extract a CI-produced static artifact into a new release, never over the live site.
tar -xzf "$archive" -C "$staging" --no-same-owner --no-same-permissions
[[ -s "$staging/index.html" && -d "$staging/pagefind" ]] || { echo 'Artifact must include index.html and the Pagefind index' >&2; exit 1; }
[[ -z "$(find "$staging" -type l -print -quit)" ]] || { echo 'Static artifact must not contain symbolic links' >&2; exit 1; }
printf '{"commit":"%s"}\n' "$revision" > "$staging/deployment.json"
chmod -R u=rwX,go=rX "$staging"
release="$root/releases/$revision-$(basename "$staging" | cut -d. -f3)"
mv -- "$staging" "$release"
staging=''
ln -s -- "$release" "$link"
mv -Tf -- "$link" "$root/current"
printf 'Published commit %s\n' "$revision"
