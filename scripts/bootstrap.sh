#!/usr/bin/env bash
# Takes a bare VPS to a live, HTTPS Ride Monitor in one command:
#
#   curl -fsSL https://raw.githubusercontent.com/SayefEshan/ride-monitor/main/scripts/bootstrap.sh | bash
#
# Installs Docker and git, clones the repo, asks for the values it cannot
# guess, builds the image on this machine, and starts the stack behind Caddy.
#
# No GitHub secrets and no CI run are needed — this builds from source, so it
# works before the pipeline has ever run. Re-running it is safe: it pulls the
# latest code, keeps your existing answers, and restarts.
set -euo pipefail

REPO_URL="https://github.com/SayefEshan/ride-monitor.git"
APP_DIR="$HOME/ride-monitor"
DEFAULT_DOMAIN="ride.assist.bd"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
warn() { printf '\033[33m%s\033[0m\n' "$1"; }
die() { printf '\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

# Piping through `curl | bash` makes stdin the pipe, so prompts must read the
# terminal directly or they would silently consume the script itself.
ask() {
  local prompt="$1" current="$2" answer=""
  if [ -n "$current" ]; then
    read -r -p "$prompt [$current]: " answer < /dev/tty || true
    printf '%s' "${answer:-$current}"
  else
    while [ -z "$answer" ]; do
      read -r -p "$prompt: " answer < /dev/tty || true
      [ -n "$answer" ] || warn "  required."
    done
    printf '%s' "$answer"
  fi
}

[ "$(id -u)" -ne 0 ] || die "Run as a normal user with sudo, not as root."
sudo -v || die "This needs sudo."

# ---------------------------------------------------------------------------
# Swap. `next build` needs well over a gigabyte; on a 1 GB VPS it gets killed
# by the OOM reaper halfway through, which just looks like a random failure.
# ---------------------------------------------------------------------------
ram_mb=$(free -m | awk '/^Mem:/ {print $2}')
swap_mb=$(free -m | awk '/^Swap:/ {print $2}')
if [ "$ram_mb" -lt 2048 ] && [ "$swap_mb" -lt 1024 ]; then
  bold "Only ${ram_mb}MB RAM and no swap — adding a 2GB swapfile so the build survives."
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# ---------------------------------------------------------------------------
# Docker and git
# ---------------------------------------------------------------------------
if ! command -v git >/dev/null 2>&1; then
  bold "Installing git…"
  sudo apt-get update -qq && sudo apt-get install -y -qq git
fi

if command -v docker >/dev/null 2>&1; then
  bold "Docker already installed."
else
  bold "Installing Docker…"
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
  sudo usermod -aG docker "$USER"
fi
sudo systemctl enable --now docker >/dev/null 2>&1 || true

# The group change only applies to a new login shell, so this run may still
# need sudo for docker while later sessions will not.
DOCKER_SUDO=""
docker info >/dev/null 2>&1 || DOCKER_SUDO="sudo"
COMPOSE=(${DOCKER_SUDO} docker compose -f docker-compose.yml -f docker-compose.build.yml)

# ---------------------------------------------------------------------------
# Source
# ---------------------------------------------------------------------------
if [ -d "$APP_DIR/.git" ]; then
  bold "Updating existing checkout…"
  git -C "$APP_DIR" fetch --quiet origin main
  git -C "$APP_DIR" reset --hard --quiet origin/main
else
  bold "Cloning $REPO_URL…"
  git clone --quiet "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

bold "Configuration — press enter to accept the value in brackets."
APP_DOMAIN=$(ask "Domain" "${APP_DOMAIN:-$DEFAULT_DOMAIN}")
NEXT_PUBLIC_SUPABASE_URL=$(ask "Supabase URL" "${NEXT_PUBLIC_SUPABASE_URL:-}")
NEXT_PUBLIC_SUPABASE_ANON_KEY=$(ask "Supabase anon key" "${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}")
SUPABASE_SERVICE_ROLE_KEY=$(ask "Supabase service-role key" "${SUPABASE_SERVICE_ROLE_KEY:-}")

# Compose reads exactly this filename when substituting ${APP_DOMAIN}, so the
# name is not a preference.
umask 077
cat > .env <<EOF
APP_DOMAIN=$APP_DOMAIN
NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
EOF
umask 022

# ---------------------------------------------------------------------------
# DNS. Caddy cannot get a certificate for a domain that does not resolve here,
# and the error it prints is far less obvious than this warning.
# ---------------------------------------------------------------------------
public_ip=$(curl -fsS --max-time 10 https://api.ipify.org || echo "")
resolved=$(getent hosts "$APP_DOMAIN" 2>/dev/null | awk '{print $1}' | head -1 || echo "")
if [ -n "$public_ip" ] && [ "$resolved" != "$public_ip" ]; then
  warn ""
  warn "  $APP_DOMAIN resolves to '${resolved:-nothing}', but this server is $public_ip."
  warn "  Point the A record here or HTTPS will fail. Continuing anyway."
fi

# ---------------------------------------------------------------------------
# Firewall
# ---------------------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp >/dev/null
  sudo ufw allow 443/tcp >/dev/null
fi

# ---------------------------------------------------------------------------
# Build and run
# ---------------------------------------------------------------------------
bold "Building the image — the first run takes a few minutes."
"${COMPOSE[@]}" up -d --build

bold "Waiting for the site to answer…"
for i in $(seq 1 30); do
  code=$(curl -sk -o /dev/null -w "%{http_code}" "https://$APP_DOMAIN/login" --max-time 10 || echo 000)
  if [ "$code" = "200" ]; then
    bold "Live at https://$APP_DOMAIN"
    echo
    echo "  Go to https://$APP_DOMAIN/onboarding to create your business."
    echo "  Logs:    cd $APP_DIR && ${DOCKER_SUDO:+sudo }docker compose logs -f"
    echo "  Restart: cd $APP_DIR && ${DOCKER_SUDO:+sudo }docker compose restart"
    [ -z "$DOCKER_SUDO" ] || echo "  Log out and back in to use docker without sudo."
    exit 0
  fi
  printf '  attempt %s/30 — HTTP %s\n' "$i" "$code"
  sleep 10
done

warn ""
warn "The site did not return 200 within five minutes."
warn "This is almost always DNS or the certificate. Check with:"
warn "  cd $APP_DIR && ${DOCKER_SUDO:+sudo }docker compose logs caddy --tail 50"
exit 1
