#!/usr/bin/env bash
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "setup-root.sh: must run as root (use sudo)" >&2; exit 1; }

REAL_USER="${SUDO_USER:-${USER:-}}"
[ -n "$REAL_USER" ] || { echo "setup-root.sh: cannot determine the invoking user" >&2; exit 1; }
command -v sqlite3 >/dev/null 2>&1 || { echo "setup-root.sh: sqlite3 is required" >&2; exit 1; }

WITH_RSHARED=0
[ "${1:-}" = "--rshared" ] && WITH_RSHARED=1

echo "==> enabling + starting the Docker daemon"
if command -v rc-update >/dev/null 2>&1; then
  rc-update add docker default || true
  rc-service docker start || rc-service docker restart
elif command -v systemctl >/dev/null 2>&1; then
  systemctl enable --now docker
elif command -v sv >/dev/null 2>&1; then
  ln -sf /etc/sv/docker /var/service/ 2>/dev/null || true
  sv up docker || true
else
  echo "setup-root.sh: no known init (openrc/systemd/runit); start dockerd manually" >&2
  exit 1
fi

echo "==> ensuring '$REAL_USER' is in the 'docker' group"
if getent group docker >/dev/null 2>&1; then
  if id -nG "$REAL_USER" | tr ' ' '\n' | grep -qx docker; then
    echo "    already a member"
  else
    usermod -aG docker "$REAL_USER"
    echo "    added '$REAL_USER' to 'docker' - log out and back in for it to take effect"
  fi
else
  groupadd docker
  usermod -aG docker "$REAL_USER"
  echo "    created 'docker' group and added '$REAL_USER' - sign in again"
fi

if [ "$WITH_RSHARED" -eq 1 ]; then
  STAGE="/home/$REAL_USER/.ompbox/stage"
  echo "==> preparing rshared staging mount at $STAGE"
  install -d -o "$REAL_USER" -g "$REAL_USER" "$STAGE"
  mountpoint -q "$STAGE" || mount --bind "$STAGE" "$STAGE"
  mount --make-rshared "$STAGE"
  echo "    mount a dir live with: sudo mount --bind /path \"$STAGE/<name>\""
  echo "    (run an agent with -d \"$STAGE\" so the staging dir is visible inside)"
fi

echo "==> verifying daemon reachability as '$REAL_USER'"
if sudo -u "$REAL_USER" docker info >/dev/null 2>&1; then
  echo "    OK - 'ompbox build' is ready to run"
else
  echo "    daemon is up but '$REAL_USER' cannot reach it yet (sign in again to pick up the docker group)"
fi
