import assert from "node:assert/strict";
import { test } from "node:test";

import { buildReceiptPath, isAllowedReceiptType, safeRelativeReceiptPath } from "./receipt-path";

const ORG = "aaaaaaaa-0000-0000-0000-000000000000";
const OTHER_ORG = "bbbbbbbb-0000-0000-0000-000000000000";

test("accepts a receipt inside the caller's own org directory", () => {
  const path = `${ORG}/2026-01-15/1737000000000-receipt.jpg`;

  assert.equal(safeRelativeReceiptPath(path, ORG), path);
});

/**
 * The disk equivalent of the storage RLS policy that keyed on the first path
 * segment: one org must never be able to name another org's file.
 */
test("refuses a path belonging to another org", () => {
  assert.equal(safeRelativeReceiptPath(`${OTHER_ORG}/2026-01-15/receipt.jpg`, ORG), null);
});

test("refuses traversal out of the receipts directory", () => {
  assert.equal(safeRelativeReceiptPath(`${ORG}/../../etc/passwd`, ORG), null);
  assert.equal(safeRelativeReceiptPath("../../etc/passwd", ORG), null);
  assert.equal(safeRelativeReceiptPath("/etc/passwd", ORG), null);
  assert.equal(safeRelativeReceiptPath(`${ORG}/2026-01-15/../../../etc/passwd`, ORG), null);
  assert.equal(safeRelativeReceiptPath(`${ORG}/a/../../${OTHER_ORG}/x.jpg`, ORG), null);
});

test("accepts the image types a phone camera produces, and nothing else", () => {
  assert.equal(isAllowedReceiptType("image/jpeg"), true);
  assert.equal(isAllowedReceiptType("image/heic"), true);
  assert.equal(isAllowedReceiptType("application/pdf"), false);
  assert.equal(isAllowedReceiptType("text/html"), false);
});

test("upload paths are namespaced by org and date, with the filename sanitised", () => {
  const path = buildReceiptPath(ORG, "2026-01-15", "../../rude name!.jpg");

  assert.ok(path.startsWith(`${ORG}/2026-01-15/`));
  assert.equal(path.includes(".."), false);
  assert.equal(path.includes("/rude"), false);
  assert.equal(safeRelativeReceiptPath(path, ORG), path);
});
