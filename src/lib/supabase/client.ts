"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client, used where the request must originate client-side — chiefly
 * uploading receipt photos straight to Storage instead of routing the bytes
 * through a server action.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
