#!/usr/bin/env bash
# One-time VPS preparation. Run this on the server, not on your laptop:
#
#   curl -fsSL https://raw.githubusercontent.com/SayefEshan/ride-monitor/main/scripts/server-setup.sh | bash
#
# or, if the repo is private, copy this file across and run `bash server-setup.sh`.
#
# Installs Docker, creates ~/ride-monitor, and drops the compose files in it.
# Afterwards you fill in .env.production and start the stack. Safe to re-run.
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/SayefEshan/ride-monitor/main"
APP_DIR="$HOME/ride-monitor"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

if [ "$(id -u)" -eq 0 ]; then
  echo "Run this as a normal user with sudo, not as root." >&2
  echo "Docker would work either way, but running the app as root is a needless risk." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------
if command -v docker >/dev/null 2>&1; then
  say "Docker is already installed — skipping."
else
  say "Installing Docker…"
  # The convenience script is Docker's own, and handles Ubuntu/Debian/CentOS.
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sudo sh /tmp/get-docker.sh
  rm -f /tmp/get-docker.sh
fi

# Lets you run docker without sudo. Needs a re-login to take effect.
if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  say "Adding $USER to the docker group…"
  sudo usermod -aG docker "$USER"
  NEEDS_RELOGIN=1
fi

sudo systemctl enable --now docker

# ---------------------------------------------------------------------------
# Application directory
# ---------------------------------------------------------------------------
say "Setting up $APP_DIR…"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Compose files are always refreshed; the filled-in env file never is.
for file in docker-compose.yml Caddyfile .env.production.example; do
  curl -fsSL "$REPO_RAW/$file" -o "$file"
done

if [ ! -f .env.production ]; then
  cp .env.production.example .env.production
  chmod 600 .env.production
  CREATED_ENV=1
fi

# ---------------------------------------------------------------------------
# Firewall, if one is active
# ---------------------------------------------------------------------------
if command -v ufw >/dev/null 2>&1 && sudo ufw status | grep -q "Status: active"; then
  say "Opening ports 80 and 443…"
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
fi

# ---------------------------------------------------------------------------
# What is left for you to do
# ---------------------------------------------------------------------------
say "Done. Remaining steps:"
cat <<EOF

  1. Point your domain's A record at this server's public IP.

  2. Fill in the secrets:
       nano $APP_DIR/.env.production

     APP_DOMAIN must match the domain from step 1, or Caddy cannot get a
     certificate. The Supabase values come from Project Settings -> API.

  3. Add these repository secrets on GitHub
     (Settings -> Secrets and variables -> Actions):

       VPS_HOST                        this server's IP
       VPS_USER                        $USER
       VPS_SSH_KEY                     a private key that can log in here
       APP_DOMAIN                      same domain as above
       NEXT_PUBLIC_SUPABASE_URL        same as in .env.production
       NEXT_PUBLIC_SUPABASE_ANON_KEY   same as in .env.production

  4. Push to main. The Deploy workflow builds the image and starts it here.

     To start it by hand instead:
       cd $APP_DIR && docker compose up -d

EOF

if [ "${CREATED_ENV:-0}" = "1" ]; then
  echo "  A blank .env.production was created — it will not work until filled in."
fi

if [ "${NEEDS_RELOGIN:-0}" = "1" ]; then
  echo "  Log out and back in before running docker without sudo."
fi
