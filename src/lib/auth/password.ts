import bcrypt from "bcryptjs";

// bcryptjs verifies the $2a$/$2b$ hashes migrated from Supabase's GoTrue, so
// every password set before the cutover keeps working unchanged.
const ROUNDS = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * A real bcrypt hash matching no password we ever accept. Compared against
 * when an email is unknown, so a login attempt costs the same time whether
 * or not the account exists.
 */
export const TIMING_DUMMY_HASH = "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
