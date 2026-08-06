import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. Bypasses RLS entirely, so it is confined to the two
 * places that genuinely need it: creating the owner's own org during
 * onboarding, and creating driver logins on the owner's behalf (drivers never
 * sign themselves up).
 *
 * Every call site must scope writes to the caller's own org_id by hand — RLS
 * will not do it here.
 */
export function createSupabaseAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — see .env.example");
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
