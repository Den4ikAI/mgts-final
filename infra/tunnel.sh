#!/usr/bin/env bash
# Publishes the local stack (API + UI on :8080) through a reverse SSH tunnel; reconnects on drops.
#   infra/tunnel.sh user@host REMOTE_PORT [KEY] [LOCAL_PORT]
#   nohup setsid infra/tunnel.sh user@host 25565 ~/id_rsa2 > /tmp/tunnel.log 2>&1 &
# The server needs `GatewayPorts yes` in sshd_config for the port to be reachable from outside.
set -u
REMOTE=${1:?user@host}; RPORT=${2:?remote port}; KEY=${3:-$HOME/.ssh/id_rsa}; LPORT=${4:-8080}
while true; do
  echo "$(date '+%F %T') tunnel ${REMOTE}:${RPORT} -> localhost:${LPORT}"
  ssh -N -o ServerAliveInterval=30 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes \
      -o StrictHostKeyChecking=accept-new -o BatchMode=yes -i "$KEY" -R "${RPORT}:localhost:${LPORT}" "$REMOTE"
  echo "$(date '+%F %T') tunnel dropped (exit $?), reconnecting in 5 s"
  sleep 5
done
