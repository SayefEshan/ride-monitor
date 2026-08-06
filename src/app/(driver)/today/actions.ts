"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient, requireSession } from "@/lib/supabase/server";

// Every money field is a number here, never a string. The spreadsheet this
// replaces accepted "2880..Taka" and "LPG/1200" into numeric columns, which is
// what broke its totals; the schema refuses to let that happen again.
const payloadSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  vehicleId: z.string().uuid(),
  status: z.enum(["worked", "off", "repair"]),
  offReason: z.string().max(200).optional(),
  km: z.number().min(0).max(2000).nullable().optional(),
  driverAmount: z.number().min(0).max(1_000_000).default(0),
  note: z.string().max(1000).optional(),
  earnings: z
    .array(
      z.object({
        platformId: z.string().uuid(),
        amount: z.number().min(0).max(1_000_000),
        trips: z.number().int().min(0).max(1000).nullable().optional(),
      }),
    )
    .max(20)
    .default([]),
  expenses: z
    .array(
      z.object({
        categoryKey: z.string().max(40),
        amount: z.number().min(0).max(1_000_000),
        note: z.string().max(200).optional(),
      }),
    )
    .max(20)
    .default([]),
  attachments: z
    .array(z.object({ path: z.string().max(400), label: z.string().max(80).optional() }))
    .max(20)
    .default([]),
});

export type DailyLogPayload = z.input<typeof payloadSchema>;
export type SubmitResult = { ok: true } | { ok: false; error: string };

/**
 * Creates or updates the report for one day.
 *
 * Both roles file through here. A driver files their own day; an owner files
 * or corrects one on the driver's behalf, which is the only way a day the
 * driver never reported can be recorded at all. RLS permits each of them
 * exactly that much (`log_driver_*` versus `log_owner_all`).
 *
 * The unique index on (vehicle_id, log_date) makes a duplicate submission
 * impossible, so this upserts by that key: a second submission edits the first
 * rather than creating the shadow rows the old Google Form produced.
 */
export async function submitDailyLog(raw: DailyLogPayload): Promise<SubmitResult> {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const input = parsed.data;

  const session = await requireSession();
  const supabase = await createSupabaseServerClient();
  const orgId = session.profile.org_id;
  const isOwner = session.profile.role === "owner";

  // Confirm the vehicle belongs to this org before writing anything against
  // it. RLS would refuse a foreign vehicle anyway; this returns a clear error
  // instead of a policy violation.
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id")
    .eq("id", input.vehicleId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!vehicle) return { ok: false, error: "vehicle" };

  const isWorked = input.status === "worked";

  // Whose day this is. A driver can only ever file their own. An owner keeps
  // whoever the day already belonged to — reattributing a historical day to
  // the current assignee would silently move pay between drivers' ledgers —
  // and falls back to the vehicle's current assignment for a brand new day.
  let driverId: string | null = session.userId;
  if (isOwner) {
    const { data: current } = await supabase
      .from("daily_logs")
      .select("driver_id")
      .eq("vehicle_id", input.vehicleId)
      .eq("log_date", input.logDate)
      .maybeSingle();

    if (current) {
      driverId = current.driver_id;
    } else {
      const { data: assignment } = await supabase
        .from("vehicle_assignments")
        .select("driver_id")
        .eq("vehicle_id", input.vehicleId)
        .is("ended_on", null)
        .maybeSingle();
      driverId = assignment?.driver_id ?? null;
    }
  }

  const { data: log, error: logError } = await supabase
    .from("daily_logs")
    .upsert(
      {
        org_id: orgId,
        vehicle_id: input.vehicleId,
        driver_id: driverId,
        log_date: input.logDate,
        status: input.status,
        off_reason: isWorked ? null : (input.offReason ?? null),
        km: isWorked ? (input.km ?? null) : null,
        driver_amount: isWorked ? input.driverAmount : 0,
        note: input.note || null,
        submitted_by: session.userId,
        source: isOwner ? "owner" : "app",
        // An owner filing a day has, by definition, just reviewed it. A driver
        // must not clear the flag — that is the owner's call, and an imported
        // day would otherwise lose its "check this" marker on any edit.
        ...(isOwner ? { needs_review: false, review_note: null } : {}),
      },
      { onConflict: "vehicle_id,log_date" },
    )
    .select("id")
    .single();

  if (logError || !log) return { ok: false, error: "save" };

  // Replace the children wholesale. Diffing two short lists would add code
  // without changing the outcome, and this keeps an edit exactly consistent
  // with what the driver sees on screen.
  await supabase.from("log_earnings").delete().eq("log_id", log.id);
  await supabase.from("expenses").delete().eq("log_id", log.id);

  if (isWorked) {
    const earnings = input.earnings.filter((e) => e.amount > 0);
    if (earnings.length > 0) {
      await supabase.from("log_earnings").insert(
        earnings.map((e) => ({
          org_id: orgId,
          log_id: log.id,
          platform_id: e.platformId,
          amount: e.amount,
          trips_count: e.trips ?? null,
        })),
      );
    }

    const expenses = input.expenses.filter((e) => e.amount > 0);
    if (expenses.length > 0) {
      const { data: categories } = await supabase
        .from("expense_categories")
        .select("id, key")
        .eq("org_id", orgId);

      const byKey = new Map((categories ?? []).map((c) => [c.key, c.id]));
      const rows = expenses
        .map((e) => {
          const categoryId = byKey.get(e.categoryKey) ?? byKey.get("other");
          if (!categoryId) return null;
          return {
            org_id: orgId,
            vehicle_id: input.vehicleId,
            log_id: log.id,
            category_id: categoryId,
            expense_date: input.logDate,
            amount: e.amount,
            note: e.note || null,
            created_by: session.userId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null);

      if (rows.length > 0) await supabase.from("expenses").insert(rows);
    }
  }

  if (input.attachments.length > 0) {
    await supabase.from("attachments").insert(
      input.attachments.map((a) => ({
        org_id: orgId,
        parent_type: "daily_log",
        parent_id: log.id,
        storage_path: a.path,
        label: a.label || null,
        uploaded_by: session.userId,
      })),
    );
  }

  revalidatePath("/today");
  revalidatePath("/history");
  revalidatePath("/home");
  revalidatePath("/dashboard");
  revalidatePath("/logs");
  return { ok: true };
}
