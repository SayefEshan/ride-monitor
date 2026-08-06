# Deployment prompt

Paste the block below into a Claude Code session **running on the VPS**. It
carries the context, the constraints, and the failure modes that are not
obvious from reading the repo.

---

I am on my Ubuntu VPS. Get this project live at **https://ride.assist.bd**, end
to end: clone it, configure it, build it, run it, and prove it is serving.

## The project

Ride Monitor — a Next.js 16 (App Router) business tracker for a ride-share
vehicle owner in Bangladesh. Repo: `https://github.com/SayefEshan/ride-monitor.git` (public).

The database is **already hosted on Supabase cloud**. Do not install Postgres,
do not run migrations, do not touch the schema. The only thing that runs on
this server is the Next.js server process.

## What is already in the repo — use it, do not reinvent it

- `Dockerfile` — multi-stage, builds the Next.js standalone output, runs as a
  non-root user
- `docker-compose.yml` — two services: the app, and Caddy in front of it. Caddy
  obtains and renews the Let's Encrypt certificate itself, so do not install
  nginx or certbot
- `docker-compose.build.yml` — overlay that builds the image here instead of
  pulling it from GHCR. Use it: no CI run or registry login is needed
- `Caddyfile` — reverse proxy for `$APP_DOMAIN`
- `scripts/bootstrap.sh` — automates all of the below. Read it first. Either
  run it, or follow it step by step if you would rather see each stage — but do
  not write a competing script

## Ask me for these first

Do not invent, guess, or generate placeholders. Stop and ask:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

They are in the Supabase dashboard under Project Settings → API. The domain is
`ride.assist.bd` and needs no asking.

## What to do

1. Confirm you are a normal user with sudo, not root. If the session is root,
   stop and tell me — the app should not run as root.
2. Check RAM. `next build` needs well over 1 GB. If total RAM is under 2 GB and
   there is no swap, create a 2 GB swapfile and make it persistent, otherwise
   the build is killed mid-run by the OOM reaper and the error looks unrelated
   to memory.
3. Install Docker (the official convenience script from get.docker.com is
   fine) and git if missing. Add me to the `docker` group, but remember the
   group only applies to a new login shell, so this session may still need
   sudo for docker commands.
4. Clone the repo to `~/ride-monitor`. If it already exists, fetch and hard
   reset to `origin/main` instead of re-cloning.
5. Write `~/ride-monitor/.env` with the four values, mode 600.
6. Verify DNS: resolve `ride.assist.bd` and compare it to this server's public
   IP. If they differ, tell me before continuing — Caddy cannot issue a
   certificate for a domain pointing elsewhere, and its error message is not
   obvious.
7. If ufw is active, allow 80/tcp and 443/tcp.
8. Build and start:
   `docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build`
9. Wait for it to come up and verify (below). The first build takes several
   minutes; do not conclude it has failed early.

## Constraints that will bite you

- **The env file must be named exactly `.env`.** Compose reads only that
  filename when substituting `${APP_DOMAIN}` in `docker-compose.yml`. Any other
  name leaves Caddy with an empty domain and TLS silently never comes up.
- **`NEXT_PUBLIC_*` values are build-time, not run-time.** Next.js inlines them
  into the browser bundle during `next build`, so they must reach the image as
  build args. The compose overlay already does this. A missing one produces an
  image that builds fine and then fails for every user in the browser.
- **`SUPABASE_SERVICE_ROLE_KEY` is run-time only.** It bypasses row-level
  security. It must never be passed as a build arg, baked into a layer, echoed
  to the terminal, or written anywhere but `.env`.
- **Never commit `.env`,** and do not `git add -A` in the checkout.
- Ports 80 and 443 are Caddy's. The app is not published to the host at all —
  it is reachable only over the internal compose network.

## Definition of done

Do not report success on "the container started". Verify:

1. `curl -s -o /dev/null -w "%{http_code}" https://ride.assist.bd/login` returns
   `200` — over real HTTPS, without `-k`. That proves the certificate is valid.
2. `docker compose ps` shows both containers up, with the app healthy.
3. The page returned is the sign-in page, not a Caddy or Next.js error page.

If any of these fail, diagnose rather than retrying blindly. `docker compose
logs caddy --tail 50` for certificate and DNS problems; `docker compose logs
app --tail 50` for application problems.

## Then tell me

- The live URL, and that `/onboarding` is where I create my business
- How to view logs, restart, and update to a newer commit
- Anything you had to change, and anything you think is fragile

Do not modify application code to make the deploy work. If something in the
repo is actually wrong, tell me what and why instead of patching around it.
