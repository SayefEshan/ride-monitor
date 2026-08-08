// Sign-in attempt budget per account. In-memory suits the single-container
// deployment; a horizontally scaled deployment would need a shared store.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

type Entry = { count: number; resetAt: number };
const attempts = new Map<string, Entry>();

/** True while `key` stays within its attempt budget for the current window. */
export function allowAttempt(key: string): boolean {
  const now = Date.now();

  if (attempts.size > 1000) {
    for (const [k, entry] of attempts) {
      if (entry.resetAt < now) attempts.delete(k);
    }
  }

  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
}

/** Forgives the budget, e.g. after a successful sign-in. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}
