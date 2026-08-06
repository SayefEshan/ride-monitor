import "server-only";

import { hashPassword, TIMING_DUMMY_HASH, verifyPassword } from "@/lib/auth/password";
import { withAdmin, type Db } from "@/lib/db";

// The only module that touches auth.users. Everything here runs as app_admin
// — the request-path role has no grant on the table at all.

type CredentialRow = { id: string; password_hash: string | null };

/** The user id for a correct email+password pair, else null — uniform timing either way. */
export async function verifyCredentials(
  email: string,
  password: string,
): Promise<string | null> {
  const row = await withAdmin((db) =>
    db.maybeOne<CredentialRow>(
      "select id, password_hash from auth.users where email = lower($1)",
      [email],
    ),
  );

  const ok = await verifyPassword(password, row?.password_hash ?? TIMING_DUMMY_HASH);
  return ok && row?.password_hash ? row.id : null;
}

/**
 * Takes the caller's transaction so user + profile creation commit or roll
 * back together — a thrown error undoes everything, with no manual cleanup.
 * Throws a unique violation (see isUniqueViolation) if the email is taken.
 */
export async function createUser(db: Db, email: string, password: string): Promise<string> {
  const hash = await hashPassword(password);
  const row = await db.one<{ id: string }>(
    "insert into auth.users (email, password_hash) values (lower($1), $2) returning id",
    [email, hash],
  );
  return row.id;
}

export async function deleteUser(db: Db, id: string): Promise<void> {
  await db.query("delete from auth.users where id = $1", [id]);
}

export async function setPassword(userId: string, newPassword: string): Promise<void> {
  const hash = await hashPassword(newPassword);
  await withAdmin((db) =>
    db.query("update auth.users set password_hash = $2 where id = $1", [userId, hash]),
  );
}
