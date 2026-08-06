import "server-only";

import { Pool, types } from "pg";

// node-postgres would otherwise hand back strings for numeric/int8 and Date
// objects for date columns. The whole app (src/lib/types.ts) expects money as
// JS numbers and dates as "YYYY-MM-DD" strings — the shapes PostgREST used to
// deliver — so parsing is fixed here, once, before any pool exists.
types.setTypeParser(1700, Number); // numeric  → number (money)
types.setTypeParser(20, Number); //   int8     → number (count(*))
types.setTypeParser(1082, (v) => v); // date   → "YYYY-MM-DD" string
types.setTypeParser(1184, (v) => v); // timestamptz → raw string, formatted at display time

function makePool(envVar: "DATABASE_URL" | "DATABASE_URL_ADMIN", max: number): Pool {
  const url = process.env[envVar];
  if (!url) throw new Error(`${envVar} is not set`);
  return new Pool({ connectionString: url, max, idleTimeoutMillis: 30_000 });
}

// Lazy: `next build` imports modules without a database anywhere in sight,
// so nothing may connect until a request actually needs to.
let userPool: Pool | undefined;
let adminPool: Pool | undefined;

/** RLS-enforced connections (role app_user). */
export function getUserPool(): Pool {
  userPool ??= makePool("DATABASE_URL", 5);
  return userPool;
}

/** BYPASSRLS connections (role app_admin) — the service-role replacement. */
export function getAdminPool(): Pool {
  adminPool ??= makePool("DATABASE_URL_ADMIN", 2);
  return adminPool;
}
