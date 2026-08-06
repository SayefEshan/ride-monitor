import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import { DEFAULT_DRIVER_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n";
import { DEFAULT_THEME, THEME_COOKIE, isTheme, type Theme } from "@/lib/theme";
import type { Organization, Profile, SessionContext } from "@/lib/types";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes
            // the session on every request, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user together with their tenant context.
 *
 * `cache` dedupes this across a single render pass, so a layout and its pages
 * can each ask for it without issuing repeated queries.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  if (!profile) return null;

  const { data: org } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .maybeSingle<Organization>();
  if (!org) return null;

  return { userId: user.id, profile, org };
});

/** Any signed-in member. Sends users without a profile through onboarding. */
export async function requireSession(): Promise<SessionContext> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

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
