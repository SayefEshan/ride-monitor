#!/usr/bin/env bash
# Verify the schema, the summary views, and every RLS policy against a local
# Postgres. Needs no Docker and no cloud service: db/migrations/ carries the
# whole schema, platform layer included, so the suite exercises exactly what
# production runs.
#
#   npm run test:db
set -euo pipefail

DB="${RIDE_MONITOR_TEST_DB:-ride_monitor_test}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! pg_isready -q; then
  echo "Postgres is not accepting connections. Start it, then re-run." >&2
  exit 1
fi

dropdb --if-exists "$DB"
createdb "$DB"

# Filename order is application order — the same rule scripts/migrate.sh uses.
for migration in "$HERE"/../migrations/*.sql; do
  psql -v ON_ERROR_STOP=1 -q -d "$DB" -f "$migration"
done

# Each assertion raises a NOTICE on success and an exception on failure, so a
# clean exit status is the pass condition.
output=$(psql -v ON_ERROR_STOP=1 -d "$DB" -f "$HERE/01_rls_test.sql" 2>&1) && status=0 || status=$?
echo "$output" | grep -E '(pass|FAIL|ERROR)' || true

if [ "$status" -ne 0 ]; then
  echo
  echo "SCHEMA/RLS SUITE FAILED" >&2
  exit "$status"
fi

echo
echo "Schema + RLS suite passed against database '$DB'."
