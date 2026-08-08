import { EmptyState } from "@/components/ui";
import { formatDate, todayInTimezone } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireDriver } from "@/lib/supabase/server";
import type { ExpenseCategory, Platform } from "@/lib/types";

import { TodayForm, type ExistingLog } from "./today-form";

export default async function TodayPage() {
  const session = await requireDriver();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  // "Today" is the organization's today. A report filed at 11pm in Dhaka must
  // not land on the server's UTC yesterday.
  const logDate = todayInTimezone(session.org.timezone);

  // Prefer the driver's live assignment; fall back to the org's only active
  // vehicle, which is the single-car case this product starts from.
  const { data: assignment } = await supabase
    .from("vehicle_assignments")
    .select("vehicle_id")
    .eq("driver_id", session.userId)
    .is("ended_on", null)
    .maybeSingle();

  let vehicleId: string | null = assignment?.vehicle_id ?? null;
  if (!vehicleId) {
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("id")
      .eq("is_active", true)
      .limit(2);
    if (vehicles?.length === 1) vehicleId = vehicles[0].id;
  }

  if (!vehicleId) {
    return (
      <EmptyState title={dict.admin.noData} body={dict.driver.noVehicle} />
    );
  }

  const [{ data: platforms }, { data: categories }, { data: log }] = await Promise.all([
    supabase.from("platforms").select("*").eq("is_active", true).order("sort"),
    supabase.from("expense_categories").select("*").order("sort"),
    supabase
      .from("daily_logs")
      .select("id, status, off_reason, km, driver_amount, note")
      .eq("vehicle_id", vehicleId)
      .eq("log_date", logDate)
      .maybeSingle(),
  ]);

  let existing: ExistingLog | null = null;
  if (log) {
    const [{ data: earnings }, { data: expenses }] = await Promise.all([
      supabase.from("log_earnings").select("platform_id, amount").eq("log_id", log.id),
      supabase.from("expenses").select("amount, expense_categories(key)").eq("log_id", log.id),
    ]);

    existing = {
      status: log.status,
      offReason: log.off_reason,
      km: log.km,
      driverAmount: Number(log.driver_amount),
      note: log.note,
      earnings: Object.fromEntries((earnings ?? []).map((e) => [e.platform_id, Number(e.amount)])),
      expenses: Object.fromEntries(
        (expenses ?? []).map((e) => {
          const category = e.expense_categories as unknown as { key: string } | null;
          return [category?.key ?? "other", Number(e.amount)];
        }),
      ),
    };
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold text-body">{dict.driver.todayTitle}</h1>
        <p className="text-sm text-muted">{formatDate(logDate, locale)}</p>
      </header>

      <TodayForm
        // Form state initialises from props; the key forces a remount if this
        // instance is ever reused for a different day or vehicle.
        key={`${vehicleId}-${logDate}`}
        dict={dict}
        locale={locale}
        orgId={session.profile.org_id}
        vehicleId={vehicleId}
        logDate={logDate}
        platforms={(platforms ?? []) as Platform[]}
        categories={(categories ?? []) as ExpenseCategory[]}
        defaultDriverPay={
          session.profile.pay_model === "fixed_daily" ? Number(session.profile.pay_value) || 0 : 0
        }
        existing={existing}
      />
    </div>
  );
}
