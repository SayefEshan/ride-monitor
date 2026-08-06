/**
 * The theme is an explicit user choice stored in a cookie, so it survives
 * sign-out and applies before a profile is even loaded. Light is the default;
 * the OS preference is deliberately not consulted, so the app looks the same
 * on every device until the user says otherwise.
 */

export const THEMES = ["light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const THEME_COOKIE = "rm_theme";
export const DEFAULT_THEME: Theme = "light";

export function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value);
}
