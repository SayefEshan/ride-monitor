import "server-only";

import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { buildReceiptPath, safeRelativeReceiptPath } from "@/lib/receipt-path";

// Receipt photos live on a Docker volume instead of Supabase Storage.
// The path rules — including the org boundary — are in receipt-path.ts.

function root(): string {
  return process.env.RECEIPTS_DIR || "/data/receipts";
}

/** Absolute path on disk, or null if the request reaches outside its org. */
function resolve(storagePath: string, orgId: string): string | null {
  const relative = safeRelativeReceiptPath(storagePath, orgId);
  return relative ? join(root(), relative) : null;
}

/** Writes an upload and returns the path to store on the attachment row. */
export async function saveReceipt(orgId: string, logDate: string, file: File): Promise<string> {
  const storagePath = buildReceiptPath(orgId, logDate, file.name);

  const target = resolve(storagePath, orgId);
  if (!target) throw new Error("refused to write outside the receipts directory");

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, Buffer.from(await file.arrayBuffer()));
  return storagePath;
}

export async function receiptFile(
  storagePath: string,
  orgId: string,
): Promise<{ stream: ReturnType<typeof createReadStream>; size: number } | null> {
  const target = resolve(storagePath, orgId);
  if (!target) return null;

  try {
    const info = await stat(target);
    if (!info.isFile()) return null;
    return { stream: createReadStream(target), size: info.size };
  } catch {
    return null;
  }
}
