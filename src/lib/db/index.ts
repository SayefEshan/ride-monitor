import "server-only";

import type { PoolClient } from "pg";
import { DatabaseError } from "pg";

import { getAdminPool, getUserPool } from "@/lib/db/client";

/** The query surface handed to `withUser`/`withAdmin` callbacks. */
export type Db = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
  /** Exactly one row, or it throws — the `.single()` replacement. */
  one<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T>;
  /** Zero or one row — the `.maybeSingle()` replacement. */
  maybeOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null>;
};

function bind(client: PoolClient): Db {
  return {
    async query<T>(text: string, params: unknown[] = []): Promise<T[]> {
      const result = await client.query(text, params);
      return result.rows as T[];
    },
    async one<T>(text: string, params: unknown[] = []): Promise<T> {
      const result = await client.query(text, params);
      if (result.rows.length !== 1) {
        throw new Error(`expected exactly 1 row, got ${result.rows.length}`);
      }
      return result.rows[0] as T;
    },
    async maybeOne<T>(text: string, params: unknown[] = []): Promise<T | null> {
      const result = await client.query(text, params);
      if (result.rows.length > 1) {
        throw new Error(`expected at most 1 row, got ${result.rows.length}`);
      }
      return (result.rows[0] as T) ?? null;
    },
  };
}

/**
 * One transaction with RLS engaged for `userId` — the anon-client
 * replacement. `set_config(..., true)` is transaction-local, so the claim
 * can never leak to another request via the pool, and every RLS policy
 * sees `auth.uid() = userId` exactly as it did under Supabase.
 */
export async function withUser<T>(userId: string, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getUserPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const value = await fn(bind(client));
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * BYPASSRLS transaction — the service-role replacement. Callers must scope
 * org_id by hand, exactly as the admin client demanded.
 */
export async function withAdmin<T>(fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await getAdminPool().connect();
  try {
    await client.query("begin");
    const value = await fn(bind(client));
    await client.query("commit");
    return value;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** True for a unique-constraint conflict (SQLSTATE 23505), e.g. a duplicate email. */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof DatabaseError && error.code === "23505";
}
