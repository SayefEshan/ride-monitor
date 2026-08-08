# Ride Monitor

Business management for ride-sharing and rental vehicle owners.

The driver files one report a minute after their shift; the owner opens a
dashboard that has already worked out income, expenses, driver pay, profit and
cost per kilometre. It replaces a Google Form feeding a spreadsheet.

## Why it exists

The spreadsheet it replaces failed in measurable ways, and each one is designed
out here rather than merely tidied up:

| Spreadsheet problem | What the product does |
| --- | --- |
| Free text in money columns (`"2880..Taka"`, `"LPG/1200"`) produced `#VALUE!` totals | Money fields are numeric-only inputs against `numeric(12,2)` columns |
| Two submissions for the same date | `unique (vehicle_id, log_date)` — a second submission edits the first |
| No way to tell "car idle" from "driver forgot" | The first question is *did the car run today?*; a No is a recorded day |
| Rental and corporate income had nowhere to go | First-class `rentals` table |
| Receipts were loose Google Drive links | Photos attach to the day, in a private per-tenant bucket |
| Owner recomputed everything by hand | Every figure is derived by SQL views and analytics functions |

## Stack

Next.js 16 (App Router, server components and actions) · Supabase (Postgres,
RLS, Auth, Storage) · Tailwind v4 · Recharts · TypeScript.

Multi-tenant from the first migration: every row carries `org_id` and is
protected by row-level security, so opening the product to other owners is
configuration rather than a rewrite.

## Setup

1. **Create a Supabase project**, then copy the keys:

   ```bash
   cp .env.example .env.local   # fill in from Project Settings -> API
   ```

2. **Apply the schema.** Paste `supabase/migrations/0001_init.sql` into the
   Supabase SQL editor, or `supabase db push` if you use the CLI. It creates the
   tables, the `daily_summary` and `vehicle_lifetime` views, every RLS policy,
   and the private `receipts` storage bucket.

3. **Run the app:**

   ```bash
   npm install
   npm run dev
   ```

4. **Create your business** at `/onboarding` — account, business and first
   vehicle in one step. Then add your driver in **Settings**; they sign in with
   their mobile number and the password you set.

## Importing the old spreadsheet

Dry run first — it writes nothing and produces a report of every judgement call:

```bash
npm run import:xlsx -- --file "~/Downloads/Driver tracker.xlsx"
```

Read `import-report.md`, then apply:

```bash
npm run import:xlsx -- --file "~/Downloads/Driver tracker.xlsx" --org <org-uuid> --apply
```

Imported days are marked `needs_review` with a note explaining what was
interpreted, and appear flagged in **Daily logs**. Re-running is safe: days are
upserted by date and their earnings and expenses replaced, never doubled.

## Tests

```bash
npm test          # everything
npm run test:unit # KPI, profit and anomaly logic
npm run test:db   # schema, summary views and every RLS policy
```

`test:db` runs against a local Postgres with `auth` and `storage` stubbed
(`supabase/tests/`), so it needs no Docker and no cloud project. It proves the
confidentiality promise directly: a driver cannot read rentals, maintenance or
lifetime P&L, and no organization can see another's rows.

`test:unit` covers the money maths in `src/lib/analytics.ts` — the figures the
owner is asked to trust — including the rule that a cost entered by the owner
still reduces profit everywhere it appears.

## Deployment

Supabase already hosts the database, so the only thing to run is the Next.js
server. It ships as a Docker image behind Caddy, which obtains and renews the
TLS certificate itself — there is no certbot timer to forget about.

**Going live — one command on the server:**

```bash
curl -fsSL https://raw.githubusercontent.com/SayefEshan/ride-monitor/main/scripts/bootstrap.sh | bash
```

It installs Docker and git, clones this repo to `~/ride-monitor`, asks for the
domain (default `ride.assist.bd`) and the three Supabase keys, builds the image
on the server, starts it behind Caddy, and waits until the site actually
answers before reporting success.

Nothing else is required for the first deploy — no registry, no CI run, no
GitHub secrets. It builds from source. Re-running it pulls the latest `main`,
keeps your answers, and restarts.

Point the domain's A record at the server first. The script warns if the
record does not resolve to this machine, because Caddy cannot obtain a
certificate for a domain that points elsewhere.

On a 1 GB VPS the script adds a 2 GB swapfile before building: `next build`
needs more than a gigabyte and is otherwise killed mid-build by the OOM
reaper, which looks like an unrelated failure.

**Then, for automatic deploys on GitHub** — Settings → Secrets and variables →
Actions. This is optional: the bootstrap above already runs the site, and
these only add push-to-deploy on top.

| Secret | What it is |
| --- | --- |
| `VPS_HOST` | server IP |
| `VPS_USER` | login user (not root) |
| `VPS_SSH_KEY` | private key that can log in as that user |
| `APP_DOMAIN` | `ride.assist.bd` — must match `~/ride-monitor/.env` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

The two `NEXT_PUBLIC_` values are needed in both places because Next.js inlines
them into the browser bundle at build time. The service-role key is not among
them: it is read only at run time from `~/ride-monitor/.env` on the server, and
never enters an image layer.

**Then every push to `main`** runs the checks, builds the image, pushes it to
GHCR and restarts the server — and finally requests the login page to confirm
the deploy actually serves traffic rather than merely starting.

Each image is tagged with its commit sha as well as `latest`, so a bad deploy
rolls back without a rebuild:

```bash
cd ~/ride-monitor
APP_IMAGE=ghcr.io/sayefeshan/ride-monitor:<good-sha> docker compose up -d
```

Pull requests run the same checks without deploying.

## Roles

**Driver** (mobile, Bangla by default) — today's report, own history, own
payment ledger, own documents. Never sees profit, business expenses or
analytics; enforced by RLS, not by hiding links.

**Owner** (desktop and mobile, English by default) — dashboard, daily logs with
receipt galleries, expenses, driver payment ledger, monthly reports with CSV
export, vehicles and settings.

## Project layout

```
src/app/(driver)/     today · history · profile              — the phone app
src/app/(admin)/      dashboard · logs · expenses · drivers
                      reports · settings                     — the business app
src/lib/analytics.ts  KPI, profit and anomaly logic (pure functions, tested)
src/lib/i18n.ts       both locales, typed so Bangla cannot drift from English
supabase/migrations/  schema, views, RLS
supabase/tests/       runnable RLS and summary verification
scripts/              one-time spreadsheet migration
```

## Roadmap

**Phase 1 (done)** — daily log, dashboard, daily logs with receipts, vehicles
and drivers, spreadsheet import, installable PWA.

**Phase 2 (done)** — driver payment ledger with payouts and outstanding
balance, standalone expenses for costs outside the daily report, monthly P&L
with category and platform splits, CSV export.

**Phase 3** — rentals, maintenance log and service reminders, document expiry
alerts, offline drafts. **Phase 4** — fleet views, SaaS onboarding and billing.
