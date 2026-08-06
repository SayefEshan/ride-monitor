import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { isAllowedReceiptType, MAX_RECEIPT_BYTES } from "@/lib/receipt-path";
import { saveReceipt } from "@/lib/storage";

/**
 * Receipt upload. A route handler rather than a server action because server
 * actions cap request bodies at 1 MB, which a phone photo clears easily.
 * The file lands under the caller's own org directory — the path is built
 * from the session, never from the client.
 */
export async function POST(request: Request) {
  const session = await requireSession();

  const form = await request.formData();
  const file = form.get("file");
  const logDate = String(form.get("logDate") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(logDate)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }
  if (!isAllowedReceiptType(file.type)) {
    return NextResponse.json({ error: "Only image files are accepted." }, { status: 415 });
  }
  if (file.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  }

  const path = await saveReceipt(session.profile.org_id, logDate, file);
  return NextResponse.json({ path });
}
