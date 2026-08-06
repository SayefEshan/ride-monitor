/**
 * Drivers in Bangladesh generally have a phone number and no email address,
 * but Supabase Auth is keyed on email. So a phone number is normalised to
 * E.164 digits and mapped onto a synthetic address in a domain we control.
 *
 * The driver only ever types their phone number; the mapping is invisible.
 */

const DRIVER_EMAIL_DOMAIN = "drivers.ridemonitor.app";

/**
 * Accepts the shapes people actually type — `01712345678`, `+8801712345678`,
 * `8801712345678`, with spaces or dashes — and returns bare E.164 digits
 * (`8801712345678`), or null when it is not a Bangladeshi mobile number.
 */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");

  // Local form: 01XXXXXXXXX (11 digits).
  if (/^01\d{9}$/.test(digits)) return `88${digits}`;
  // Country-code form: 8801XXXXXXXXX (13 digits).
  if (/^8801\d{9}$/.test(digits)) return digits;

  return null;
}

export function isEmail(input: string): boolean {
  return input.includes("@");
}

/**
 * Maps whatever the user typed onto the email Supabase Auth expects.
 * Returns null when the input is neither an email nor a valid phone number.
 */
export function identifierToEmail(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (isEmail(trimmed)) return trimmed.toLowerCase();

  const phone = normalizeBdPhone(trimmed);
  return phone ? `${phone}@${DRIVER_EMAIL_DOMAIN}` : null;
}

/** Presentable form of a stored phone number: `+880 1712-345678`. */
export function formatPhone(phone: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/[^\d]/g, "");
  if (/^8801\d{9}$/.test(digits)) {
    // Skip the country code *and* the trunk zero: 8801712345678 is written
    // +880 1712-345678 internationally, never +880 0171-…
    return `+880 ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
