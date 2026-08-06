import { redirect } from "next/navigation";

import { getSessionContext, homePathFor } from "@/lib/supabase/server";

/**
 * The root exists only to route a signed-in user to the app that belongs to
 * them: owners land on the dashboard, drivers on today's report.
 */
export default async function Home() {
  const session = await getSessionContext();

  // Middleware has already bounced anonymous traffic, so a missing session
  // here means the account exists but has no organization yet.
  if (!session) redirect("/onboarding");

  redirect(homePathFor(session.profile.role));
}
