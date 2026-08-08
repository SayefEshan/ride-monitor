"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient, requireOwner } from "@/lib/supabase/server";

// Codes, not sentences; the form maps them through the dictionary.
export type PaymentState = { error?: string; success?: string };

const schema = z.object({
  driverId: z.string().uuid(),
  amount: z.coerce.number().positive().max(1_000_000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  method: z.string().max(40).optional(),
  note: z.string().max(200).optional(),
});

/**
 * Records cash actually handed to a driver.
 *
 * Payouts are kept separate from the per-day accrual on `daily_logs` so the
 * ledger can show earned, paid and outstanding as three independent numbers —
 * which is what settles an end-of-month disagreement.
 */
export async function recordPayment(
  _prev: PaymentState,
  formData: FormData,
): Promise<PaymentState> {
  const session = await requireOwner();

  const parsed = schema.safeParse({
    driverId: formData.get("driverId"),
    amount: formData.get("amount"),
    paidOn: formData.get("paidOn"),
    method: formData.get("method") || undefined,
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createSupabaseServerClient();

  // RLS would block a foreign driver anyway; this turns that into a clear
  // message rather than a policy error.
  const { data: driver } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", parsed.data.driverId)
    .eq("org_id", session.profile.org_id)
    .maybeSingle();
  if (!driver) return { error: "driver" };

  const { error } = await supabase.from("driver_payments").insert({
    org_id: session.profile.org_id,
    driver_id: parsed.data.driverId,
    amount: parsed.data.amount,
    paid_on: parsed.data.paidOn,
    method: parsed.data.method ?? null,
    note: parsed.data.note ?? null,
  });

  if (error) return { error: "save" };

  revalidatePath("/drivers");
  revalidatePath("/dashboard");
  return { success: "saved" };
}
