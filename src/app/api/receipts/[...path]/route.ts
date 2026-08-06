import { NextResponse } from "next/server";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

import { requireSession } from "@/lib/auth/session";
import { receiptFile } from "@/lib/storage";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
};

/**
 * Serves a receipt to the org it belongs to. Replaces Supabase's signed URLs:
 * the session cookie is the authorisation, and `receiptFile` refuses any path
 * outside the caller's own org directory.
 */
export async function GET(_request: Request, { params }: RouteContext<"/api/receipts/[...path]">) {
  const session = await requireSession();
  const { path } = await params;

  const storagePath = path.join("/");
  const file = await receiptFile(storagePath, session.profile.org_id);
  if (!file) return new NextResponse("Not found", { status: 404 });

  const extension = storagePath.split(".").pop()?.toLowerCase() ?? "";
  const body = Readable.toWeb(file.stream) as NodeReadableStream<Uint8Array>;

  return new NextResponse(body as unknown as BodyInit, {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Content-Length": String(file.size),
      "Cache-Control": "private, max-age=600",
    },
  });
}
