// Session tokens. Deliberately importable from middleware: jose runs on the
// edge runtime and nothing here touches the database.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS)
    .sign(secret());
}

/** The user id inside a valid, unexpired session token; null for anything else. */
export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
