# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

- `npm run dev` — dev server at localhost:3000
- `npm run build` / `npm run lint`
- `npm test` — unit + database suites
- `npm run test:unit` — money/KPI logic via `node --test`. Single file: `node --import tsx --test src/lib/analytics.test.ts`
- `npm run test:db` — schema, summary views, and every RLS policy against a local Postgres (no Docker, no cloud project; `auth`/`storage` are stubbed). Requires a running local Postgres; drops and recreates `ride_monitor_test` (override with `RIDE_MONITOR_TEST_DB`).
- `npm run import:xlsx -- --file <path>` — spreadsheet import, dry run by default (writes `import-report.md`); add `--org <uuid> --apply` to write. Re-running is safe: days upsert by (vehicle, date).
- `npm run seed:demo` — seed the demo org

Env: copy `.env.example` → `.env.local` (Supabase URL, anon key, service-role key). `SUPABASE_SERVICE_ROLE_KEY` is server-only and bypasses RLS.

## What this is

Business management for ride-share/rental vehicle owners in Bangladesh: the driver files one report after their shift; the owner gets a dashboard with income, expenses, driver pay, profit, and cost per km already derived. Two apps in one Next.js 16 project (App Router, server components + server actions):

- `src/app/(driver)/` — the driver's phone app (home · today · history · profile), Bangla by default. `home` is the landing page (`homePathFor`) and leads with the file-today action; `history` is a month-scoped report, not a flat list.
- `src/app/(admin)/` — the owner's business app (dashboard · logs · expenses · drivers · reports · settings), English by default

Driver screens select only columns the driver reported themselves (`log_date`, `status`, `km`, `income`, `driver_amount`) — never `net` or `expense` from `daily_summary`, which describe the business rather than their day.

Mutations are server actions in `actions.ts` files colocated with their pages. The only route handler is `(admin)/reports/export` (CSV).

Both roles file a daily report through the **same** form and the same action: `TodayForm` + `submitDailyLog` (`(driver)/today/`). The owner reuses them at `/logs/new?date=&vehicle=` to file or correct a day on the driver's behalf — reached from the dashboard's "no report today" badge, the logs list, and a log's detail page. The action branches on role: a driver always writes `driver_id = self`; an owner keeps the day's existing `driver_id` (reattributing it would move pay between drivers' ledgers) and falls back to the vehicle's active assignment, records `source='owner'` with `submitted_by` = the owner, and is the only role allowed to clear `needs_review`. Driver-voiced copy anchored to "today" is overridden via `TodayForm`'s optional `headings` prop.

## Authorization: three layers, RLS is the real one

1. `src/proxy.ts` (Next 16's middleware) — refreshes the Supabase session on every request and redirects unauthenticated traffic to `/login`. Authentication only, never role decisions.
2. Page guards in `src/lib/supabase/server.ts` — `requireOwner()` / `requireDriver()` redirect each role to its own app. UX-level.
3. Postgres RLS in `supabase/migrations/0001_init.sql` — the actual security boundary. Every business row carries `org_id`; the policies are built on `auth_org_id()` / `auth_role()` / `is_owner()` (SECURITY DEFINER helpers). The confidentiality promise — a driver can never read rentals, maintenance, or lifetime P&L; no org can see another's rows — is enforced here and asserted by `npm run test:db`, not by hiding links.

Three Supabase clients in `src/lib/supabase/`:
- `server.ts` — cookie-bound, RLS applies. The default; also home of `getSessionContext()` (React `cache`-deduped) and the guards.
- `client.ts` — browser client.
- `admin.ts` — service role, bypasses RLS. Confined to onboarding (creating the owner's org) and creating driver logins. Every call site must scope writes to the caller's `org_id` by hand.

## Identity

Drivers have phone numbers, not emails, but Supabase Auth is keyed on email. `src/lib/identity.ts` maps a Bangladeshi mobile (`01712345678`) onto a synthetic address (`8801712345678@drivers.ridemonitor.app`). Sign-in (`src/app/auth-actions.ts`) deliberately returns the same error for a bad identifier and a bad password. `formatPhone` is display-only — don't touch `normalizeBdPhone` / `identifierToEmail` for presentation concerns; they are auth-path.

## Money math

KPI/profit/anomaly logic is pure functions in `src/lib/analytics.ts`, tested in `analytics.test.ts`. Derived figures come from the SQL views (`daily_summary`, `vehicle_lifetime`) plus `analytics.ts` — never ad-hoc arithmetic in components. Key invariant: an owner-entered standalone expense (no daily log behind it) must reduce profit everywhere profit appears; `withStandalone()` exists so the dashboard and the monthly report can never quote different numbers for the same month.

## i18n

Both locales live in one typed object in `src/lib/i18n.ts`, so a string added to English without its Bangla counterpart fails the build. Locale resolution (`getLocale()` in `server.ts`): explicit cookie → profile preference → Bangla (the driver is the default reader).

## Schema changes

`supabase/tests/run-tests.sh` applies `00_supabase_stubs.sql` and then `0001_init.sql` explicitly — a new migration file must also be added to that script. Any new table needs `org_id`, RLS policies, and matching assertions in `01_rls_test.sql`. Data rules the schema already enforces (don't re-implement in app code): money columns are `numeric(12,2)`, one log per `(vehicle_id, log_date)` (a second submission edits the first), and driver pay terms are snapshotted onto each daily log so rate changes never rewrite history.

## Design system

Hue encodes money direction — it is information, not decoration — using standard finance conventions: green (`--color-income`) is money in, red (`--color-expense`) is money out (including negative profit), blue (`--color-profit` = `--color-brand`) is what the owner keeps plus primary actions, amber (`--color-warn`) is needs-attention (review flags, anomalies, balances due). Never add a hue without a metric behind it. Tokens live in `src/app/globals.css`; Tailwind v4 (CSS-first config, no `tailwind.config`).

Theme is an explicit cookie choice (`rm_theme`, default light — the OS preference is deliberately ignored), stamped as `data-theme` on `<html>` by the root layout and switched with `ThemeToggle`. The `-soft` tints and `-deep` text tones are theme-dependent variables; on tinted chips always pair `bg-*-soft` with `text-*-deep` rather than raw hues.
