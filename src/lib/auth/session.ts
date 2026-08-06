import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { SESSION_COOKIE } from "@/lib/auth/cookies";
import { verifySession } from "@/lib/auth/jwt";
import { withUser } from "@/lib/db";
import { DEFAULT_DRIVER_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n";
import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";
import type { Organization, Profile, SessionContext } from "@/lib/types";

/**
 * The signed-in user id, from the session cookie alone. Only the signature
 * and expiry are checked here — the profile lookup below is what proves the
 * user still exists, and RLS is what decides what they may see.
 */
export const getAuthUserId = cache(async (): Promise<string | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? verifySession(token) : null;
});

/**
 * The signed-in user together with their tenant context.
 *
 * `cache` dedupes this across a single render pass, so a layout and its pages
 * can each ask for it without issuing repeated queries.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const userId = await getAuthUserId();
  if (!userId) return null;

  return withUser(userId, async (db) => {
    const profile = await db.maybeOne<Profile>("select * from profiles where id = $1", [userId]);
    if (!profile) return null;

    const org = await db.maybeOne<Organization>("select * from organizations where id = $1", [
      profile.org_id,
    ]);
    if (!org) return null;

    return { userId, profile, org };
  });
});

/** Any signed-in member. Sends users without a profile through onboarding. */
export async function requireSession(): Promise<SessionContext> {
  const userId = await getAuthUserId();
  if (!userId) redirect("/login");

  const session = await getSessionContext();
  if (!session) redirect("/onboarding");
  return session;
}

export async function requireOwner(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.profile.role !== "owner") redirect("/home");
  return session;
}

export async function requireDriver(): Promise<SessionContext> {
  const session = await requireSession();
  if (session.profile.role !== "driver") redirect("/dashboard");
  return session;
}

/** Where a signed-in user belongs, given their role. */
export function homePathFor(role: Profile["role"]): string {
  return role === "owner" ? "/dashboard" : "/home";
}

/** Display theme: an explicit cookie choice, defaulting to light. */
export async function getTheme(): Promise<Theme> {
  const value = (await cookies()).get(THEME_COOKIE)?.value;
  return isTheme(value) ? value : DEFAULT_THEME;
}

/**
 * Display language: an explicit cookie choice wins, then the user's saved
 * preference, then Bangla — the driver is the default reader.
 */
export async function getLocale(): Promise<Locale> {
  const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieValue)) return cookieValue;

  const session = await getSessionContext();
  if (session && isLocale(session.profile.locale)) return session.profile.locale;

  return DEFAULT_DRIVER_LOCALE;
}

/**
 * Runs `fn` inside a transaction scoped to the signed-in user, so every
 * query in it is filtered by the same RLS policies that guarded the
 * PostgREST calls this replaced. The common shape in pages and actions.
 */
export async function withSessionDb<T>(
  session: SessionContext,
  fn: Parameters<typeof withUser<T>>[1],
): Promise<T> {
  return withUser(session.userId, fn);
}
