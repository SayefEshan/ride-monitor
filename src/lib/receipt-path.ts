import { normalize } from "node:path";

// Pure path and type rules for receipt uploads, kept apart from the
// filesystem access in `storage.ts` so they can be unit-tested directly.
// Receipt paths keep the exact shape the Supabase bucket used —
// `<orgId>/<logDate>/<ts>-<name>` — so existing attachments.storage_path
// rows stay valid.

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic"]);

export function isAllowedReceiptType(type: string): boolean {
  return ALLOWED_TYPES.has(type);
}

/**
 * The relative path within the receipts directory, or null if it escapes the
 * org's own folder. This is the disk equivalent of the storage RLS policy
 * that keyed on the first path segment.
 */
export function safeRelativeReceiptPath(storagePath: string, orgId: string): string | null {
  if (storagePath.startsWith("/") || storagePath.includes("\0")) return null;

  const clean = normalize(storagePath);
  if (clean.startsWith("..") || clean.includes(`..${"/"}`) || clean.startsWith("/")) return null;
  if (clean.split("/")[0] !== orgId) return null;

  return clean;
}

/** The storage path for a new upload. Built from the session, never the client. */
export function buildReceiptPath(orgId: string, logDate: string, fileName: string): string {
  const safeName = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    // Dots survive the pass above, so a run of them is flattened separately:
    // no filename we write should ever contain "..".
    .replace(/\.{2,}/g, "_")
    .slice(-80);
  return `${orgId}/${logDate}/${Date.now()}-${safeName}`;
}
