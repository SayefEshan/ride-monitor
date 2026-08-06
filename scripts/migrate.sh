#!/usr/bin/env bash
# Apply db/migrations/*.sql in filename order, once each, tracked in a
# schema_migrations table. Connection comes from the usual PG* environment
# variables (or PGDATABASE etc. defaults), so the same script serves local
# work, CI, and production:
#
#   docker compose exec -T -e APP_DB_PASSWORD -e ADMIN_DB_PASSWORD db \
#     sh -c 'cd /migrations-mount && ...'          # or copy files in and run
#
# If APP_DB_PASSWORD / ADMIN_DB_PASSWORD are set, the app roles are made
# LOGIN with those passwords afterwards — credentials come from the
# environment, never from a committed file. Unset (tests, CI), the roles
# stay NOLOGIN and suites impersonate them with SET ROLE.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$HERE/../db/migrations}"

psql -v ON_ERROR_STOP=1 -q -c "
  create table if not exists schema_migrations (
    filename   text primary key,
    applied_at timestamptz not null default now()
  );
"

for file in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$file")"
  applied=$(psql -tA -c "select 1 from schema_migrations where filename = '$name'")
  if [ "$applied" = "1" ]; then
    echo "skip  $name (already applied)"
    continue
  fi
  echo "apply $name"
  psql -v ON_ERROR_STOP=1 -q -1 -f "$file"
  psql -v ON_ERROR_STOP=1 -q -c "insert into schema_migrations (filename) values ('$name')"
done

if [ -n "${APP_DB_PASSWORD:-}" ] && [ -n "${ADMIN_DB_PASSWORD:-}" ]; then
  psql -v ON_ERROR_STOP=1 -q \
    -v app_pw="$APP_DB_PASSWORD" -v admin_pw="$ADMIN_DB_PASSWORD" <<'SQL'
alter role app_user login password :'app_pw';
alter role app_admin login password :'admin_pw';
SQL
  echo "role passwords set (app_user, app_admin are LOGIN)"
else
  echo "APP_DB_PASSWORD/ADMIN_DB_PASSWORD not set — roles left NOLOGIN"
fi

echo "migrations up to date"
