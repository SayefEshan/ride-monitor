"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createSupabaseServerClient, requireOwner } from "@/lib/supabase/server";

export type ExpenseState = { error?: string; success?: string };

const schema = z.object({
  vehicleId: z.string().uuid(),
  categoryId: z.string().uuid(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().positive().max(10_000_000),
  note: z.string().max(200).optional(),
});

/**
 * Records a cost that never passes through a daily report — a workshop bill,
 * insurance renewal, a traffic fine paid later.
 *
 * `log_id` stays null, which is what distinguishes these from the fuel and
 * parking the driver enters. Both still roll into the same expense totals.
 */
export async function addExpense(_prev: ExpenseState, formData: FormData): Promise<ExpenseState> {
  const session = await requireOwner();

  const parsed = schema.safeParse({
    vehicleId: formData.get("vehicleId"),
    categoryId: formData.get("categoryId"),
    expenseDate: formData.get("expenseDate"),
    amount: formData.get("amount"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Enter an amount, a date and a category." };

  const supabase = await createSupabaseServerClient();
  const orgId = session.profile.org_id;

  const [{ data: vehicle }, { data: category }] = await Promise.all([
    supabase
      .from("vehicles")
      .select("id")
      .eq("id", parsed.data.vehicleId)
      .eq("org_id", orgId)
      .maybeSingle(),
    supabase
      .from("expense_categories")
      .select("id")
      .eq("id", parsed.data.categoryId)
      .eq("org_id", orgId)
      .maybeSingle(),
  ]);

  if (!vehicle || !category) return { error: "Unknown vehicle or category." };

  const { error } = await supabase.from("expenses").insert({
    org_id: orgId,
    vehicle_id: vehicle.id,
    log_id: null,
    category_id: category.id,
    expense_date: parsed.data.expenseDate,
    amount: parsed.data.amount,
    note: parsed.data.note ?? null,
    created_by: session.userId,
  });

  if (error) return { error: "Could not save the expense." };

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  return { success: "Expense saved." };
}
