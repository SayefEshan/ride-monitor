import type { Locale } from "./i18n";

// Bangladesh groups digits in the lakh/crore style (1,00,000), which `en-BD`
// already encodes. Latin digits throughout: that is what phone keypads produce
// and what receipts from the ride-hailing apps show.
const moneyFormat = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 0,
});

const moneyWithPaisa = new Intl.NumberFormat("en-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const TAKA = "৳";

export function formatMoney(amount: number | null | undefined, opts?: { paisa?: boolean }): string {
  const value = Number(amount ?? 0);
  const body = opts?.paisa ? moneyWithPaisa.format(value) : moneyFormat.format(Math.round(value));
  return `${TAKA}${body}`;
}

/** Compact form for chart axes, where full numbers do not fit. */
export function formatMoneyShort(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  const abs = Math.abs(value);
  if (abs >= 100000) return `${TAKA}${(value / 100000).toFixed(1)}L`;
  if (abs >= 1000) return `${TAKA}${(value / 1000).toFixed(1)}k`;
  return `${TAKA}${Math.round(value)}`;
}

export function formatKm(km: number | null | undefined): string {
  if (km === null || km === undefined) return "—";
  return `${moneyFormat.format(Math.round(Number(km)))} km`;
}

export function formatNumber(value: number | null | undefined): string {
  return moneyFormat.format(Number(value ?? 0));
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// ---------------------------------------------------------------------------
// Dates.
//
// "Today" must mean today in the *organization's* timezone. A driver in Dhaka
// submitting at 11pm would otherwise be filed against the server's UTC
// yesterday, which is exactly the class of silent error this product exists to
// remove.
// ---------------------------------------------------------------------------

/** Current date in `tz` as `YYYY-MM-DD`. `en-CA` renders precisely that shape. */
export function todayInTimezone(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Shifts an ISO date string by whole days without touching timezones. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Inclusive `[start, end]` covering the calendar month that `isoDate` falls in. */
export function monthRange(isoDate: string): { start: string; end: string } {
  const [y, m] = isoDate.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start, end: `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}` };
}

/** Inclusive range covering the last `days` days, ending on `isoDate`. */
export function lastNDays(isoDate: string, days: number): { start: string; end: string } {
  return { start: addDays(isoDate, -(days - 1)), end: isoDate };
}

/**
 * The previous month clipped to the same elapsed span as `isoDate`.
 *
 * On the 4th of a month, comparing four days against a full previous month
 * shows a collapse every time — a false alarm that teaches the owner to
 * ignore the warning. Comparing 1–4 against 1–4 is the honest question.
 * Months that ran short are clamped to their own last day.
 */
export function comparablePreviousMonth(isoDate: string): { start: string; end: string } {
  const day = Number(isoDate.slice(8, 10));
  const previous = monthRange(addDays(monthRange(isoDate).start, -1));
  const lastDay = Number(previous.end.slice(8, 10));
  const endDay = Math.min(day, lastDay);

  return {
    start: previous.start,
    end: `${previous.start.slice(0, 8)}${String(endDay).padStart(2, "0")}`,
  };
}

const dateLocale: Record<Locale, string> = { en: "en-GB", bn: "bn-BD" };

export function formatDate(isoDate: string, locale: Locale = "en"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(dateLocale[locale], {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateShort(isoDate: string, locale: Locale = "en"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(dateLocale[locale], {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * "August 2026" / "আগস্ট ২০২৬".
 *
 * Month headings used to be built by stripping the leading day off a full
 * date, which only ever worked in English — `\d` does not match Bangla
 * numerals, so bn readers saw "১ আগ, ২০২৬" where a month name belonged.
 */
export function formatMonth(isoDate: string, locale: Locale = "en"): string {
  const [y, m] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(dateLocale[locale], {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function formatWeekday(isoDate: string, locale: Locale = "en"): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat(dateLocale[locale], {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
