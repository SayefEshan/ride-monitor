import assert from "node:assert/strict";
import { test } from "node:test";

// The secret is read per call, not at import time, so setting it here is
// enough — and keeps this a plain static import.
process.env.AUTH_SECRET ??= "test-secret-not-used-anywhere-real-0123456789";

import { signSession, verifySession } from "./jwt";

const USER = "11111111-1111-1111-1111-111111111111";

test("a signed session round-trips to the same user id", async () => {
  assert.equal(await verifySession(await signSession(USER)), USER);
});

test("a tampered token is rejected", async () => {
  const token = await signSession(USER);
  const [header, payload, signature] = token.split(".");

  // Same signature, different payload — the classic forgery attempt.
  const forgedPayload = Buffer.from(
    JSON.stringify({ sub: "22222222-2222-2222-2222-222222222222" }),
  ).toString("base64url");

  assert.equal(await verifySession(`${header}.${forgedPayload}.${signature}`), null);
  assert.equal(await verifySession(`${header}.${payload}.${signature}x`), null);
});

test("garbage and empty tokens are rejected rather than throwing", async () => {
  assert.equal(await verifySession(""), null);
  assert.equal(await verifySession("not-a-jwt"), null);
});

test("a token signed with a different secret is rejected", async () => {
  const token = await signSession(USER);

  process.env.AUTH_SECRET = "a-completely-different-secret-value-987654";
  const rejected = await verifySession(token);
  process.env.AUTH_SECRET = "test-secret-not-used-anywhere-real-0123456789";

  assert.equal(rejected, null);
});
