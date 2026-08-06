import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { TodayForm, type ExistingLog } from "@/app/(driver)/today/today-form";
import { Card, EmptyState } from "@/components/ui";
import { formatDate, todayInTimezone } from "@/lib/format";
import { getDictionary, t } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { ExpenseCategory, Platform, Profile } from "@/lib/types";

/**
 * Owner-side daily report entry.
 *
 * The dashboard could say "no report for today" but, until this existed, gave
 * the owner no way to act on it — a day the driver never filed stayed missing
 * forever. This is the same form the driver uses, filed on their behalf, so
 * the two paths cannot drift apart.
 */
export default async function NewLogPage({ searchParams }: PageProps<"/logs/new">) {
  const session = await requireOwner();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const today = todayInTimezone(session.org.timezone);
  const params = await searchParams;

  // A future day cannot be reported, so anything beyond today is clamped back.
  const requested =
    typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : today;
  const logDate = requested > today ? today : requested;

  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("id, name")
    .eq("is_active", true)
    .order("created_at");

  const requestedVehicle = typeof params.vehicle === "string" ? params.vehicle : null;
  const vehicle =
    (vehicles ?? []).find((v) => v.id === requestedVehicle) ?? (vehicles ?? [])[0] ?? null;

  if (!vehicle) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-body">{dict.admin.addReport}</h1>
        <EmptyState title={dict.admin.noData} body="Add a vehicle in Settings first." />
      </div>
    );
  }

  const [{ data: platforms }, { data: categories }, { data: log }, { data: assignment }] =
    await Promise.all([
      supabase.from("platforms").select("*").eq("is_active", true).order("sort"),
      supabase.from("expense_categories").select("*").order("sort"),
      supabase
        .from("daily_logs")
        .select("id, status, off_reason, km, driver_amount, note, driver_id")
        .eq("vehicle_id", vehicle.id)
        .eq("log_date", logDate)
        .maybeSingle(),
      supabase
        .from("vehicle_assignments")
        .select("driver_id")
        .eq("vehicle_id", vehicle.id)
        .is("ended_on", null)
        .maybeSingle(),
    ]);

  // Whoever the day already belongs to, else the vehicle's current assignee —
  // the same rule the save action applies, so the screen cannot name a
  // different driver than the one that actually gets written.
  const driverId = log?.driver_id ?? assignment?.driver_id ?? null;
  const { data: driver } = driverId
    ? await supabase
        .from("profiles")
        .select("id, full_name, pay_value")
        .eq("id", driverId)
        .maybeSingle<Pick<Profile, "id" | "full_name" | "pay_value">>()
    : { data: null };

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

  const readableDate = formatDate(logDate, locale);

  return (
    <div className="mx-auto w-full max-w-lg space-y-4">
      <Link
        href="/logs"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-body"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {dict.admin.backToLogs}
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-body">
          {log ? dict.admin.editReport : dict.admin.addReport}
        </h1>
        <p className="text-sm text-muted">
          {readableDate} · {vehicle.name}
        </p>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-sm text-muted">
          {driver
            ? t(dict.admin.filingForDriver, { name: driver.full_name })
            : dict.admin.filingNoDriver}
        </p>

        {/* Changing the date reloads the page, so the form always opens on
            whatever that day already holds rather than stale state. */}
        <form className="flex items-center gap-2">
          <label htmlFor="date" className="text-sm text-muted">
            {dict.admin.pickDate}
          </label>
          <input
            id="date"
            type="date"
            name="date"
            defaultValue={logDate}
            max={today}
            className="min-h-10 rounded-lg border border-hairline bg-raised px-2 text-sm text-body"
          />
          <input type="hidden" name="vehicle" value={vehicle.id} />
          <button
            type="submit"
            className="min-h-10 rounded-lg border border-hairline px-3 text-sm font-medium text-body hover:bg-sunken"
          >
            {dict.common.next}
          </button>
        </form>
      </Card>

      <TodayForm
        dict={dict}
        locale={locale}
        orgId={session.profile.org_id}
        vehicleId={vehicle.id}
        logDate={logDate}
        platforms={(platforms ?? []) as Platform[]}
        categories={(categories ?? []) as ExpenseCategory[]}
        defaultDriverPay={Number(driver?.pay_value) || 0}
        existing={existing}
        headings={{
          didCarRun: t(dict.admin.didCarRunOn, { date: readableDate }),
          submitted: t(dict.admin.reportSavedFor, { date: readableDate }),
          editAgain: dict.admin.editReport,
          // "Your pay for today" is the driver talking to themselves; the
          // owner is recording someone else's pay for a past date.
          earningsTitle: dict.admin.income,
          payTitle: dict.admin.driverPay,
          payAmount: dict.admin.driverPay,
        }}
      />
    </div>
  );
}
