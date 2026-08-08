"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { THEME_COOKIE, isTheme } from "@/lib/theme";
import { identifierToEmail } from "@/lib/identity";
import { allowAttempt, clearAttempts } from "@/lib/rate-limit";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

/**
 * Drivers sign in with a phone number, owners with an email. Both resolve to
 * the same Supabase Auth email under the hood.
 *
 * A bad identifier and a bad password return the same message on purpose: the
 * response must not reveal which accounts exist.
 */
export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  const email = identifierToEmail(identifier);
  if (!email || !password) return { error: "invalid" };

  // Slow a credential-stuffing loop to a crawl. Keyed per account so an
  // attacker cannot lock everyone out, and forgiven on success.
  if (!allowAttempt(`signin:${email}`)) return { error: "throttled" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "invalid" };
  clearAttempts(`signin:${email}`);

  // Only ever redirect within this app — an absolute URL here would be an
  // open redirect. Backslashes are rejected too: browsers treat "/\evil.com"
  // exactly like "//evil.com".
  const safeNext = next.startsWith("/") && !next.startsWith("//") && !next.includes("\\");
  redirect(safeNext ? next : "/");
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  // Redirect regardless — /login is safe either way — but keep the failure
  // visible in server logs so a "sessions won't clear" outage shows up.
  if (error) console.error("signOut failed:", error.message);
  redirect("/login");
}

/**
 * Switches display language. Stored as a cookie so it survives sign-out and
 * applies before a profile is even loaded.
 */
export async function setLocale(formData: FormData) {
  const value = String(formData.get("locale") ?? "");
  if (!isLocale(value)) return;

  const store = await cookies();
  store.set(LOCALE_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}

/** Switches display theme. A cookie for the same reasons as the locale. */
export async function setTheme(formData: FormData) {
  const value = String(formData.get("theme") ?? "");
  if (!isTheme(value)) return;

  const store = await cookies();
  store.set(THEME_COOKIE, value, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });

  revalidatePath("/", "layout");
}
