import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";

import { Card } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDate,
  formatKm,
  formatMoney,
  monthRange,
  todayInTimezone,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireDriver } from "@/lib/supabase/server";
import type { DailySummary } from "@/lib/types";

/**
 * The driver's landing screen.
 *
 * It answers the three questions a driver actually opens the app with, in the
 * order they matter: is today filed, what have I earned this month, and what
 * am I still owed. Filing today sits first because it is the one action the
 * whole product depends on.
 *
 * Only columns the driver reported themselves are selected — never `net` or
 * `expense`, which describe the business rather than their day.
 */
type DriverDay = Pick<
  DailySummary,
  "log_id" | "log_date" | "status" | "km" | "income" | "driver_amount"
>;

export default async function DriverHomePage() {
  const session = await requireDriver();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const today = todayInTimezone(session.org.timezone);
  const month = monthRange(today);

  // One window wide enough to cover both this month and a recent-days list, so
  // the first of the month still has something to show.
  const windowStart = month.start < addDays(today, -30) ? month.start : addDays(today, -30);

  const [{ data: recentRows }, { data: allPay }, { data: payments }] = await Promise.all([
    supabase
      .from("daily_summary")
      .select("log_id, log_date, status, km, income, driver_amount")
      .gte("log_date", windowStart)
      .lte("log_date", today)
      .order("log_date", { ascending: false }),
    supabase.from("daily_summary").select("driver_amount"),
    supabase.from("driver_payments").select("amount"),
  ]);

  const recent = (recentRows ?? []) as DriverDay[];
  const inMonth = recent.filter((day) => day.log_date >= month.start && day.log_date <= month.end);

  const todayLog = recent.find((day) => day.log_date === today) ?? null;

  const pay = inMonth.reduce((sum, day) => sum + Number(day.driver_amount ?? 0), 0);
  const fares = inMonth.reduce((sum, day) => sum + Number(day.income ?? 0), 0);
  const km = inMonth.reduce((sum, day) => sum + Number(day.km ?? 0), 0);
  const worked = inMonth.filter((day) => day.status === "worked").length;

  // Accrued is every day ever worked; received is what the owner has actually
  // handed over. Showing both is what settles the end-of-month conversation.
  const accrued = (allPay ?? []).reduce((sum, row) => sum + Number(row.driver_amount ?? 0), 0);
  const paid = (payments ?? []).reduce((sum, row) => sum + Number(row.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-body">{session.profile.full_name}</h1>
        <p className="text-sm text-muted">{formatDate(today, locale)}</p>
      </header>

      {/* The one action the product depends on, before anything else. */}
      {todayLog ? (
        <Card className="flex items-center gap-3">
          <CheckCircle2 aria-hidden className="size-6 shrink-0 text-income" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-body">{dict.driver.todayDone}</p>
            <p className="tnum text-sm text-muted">
              {dict.driver.yourPay} · {formatMoney(todayLog.driver_amount)}
            </p>
          </div>
          <Link
            href="/today"
            className="shrink-0 text-sm font-medium text-brand underline underline-offset-4"
          >
            {dict.driver.viewOrEdit}
          </Link>
        </Card>
      ) : (
        <Card className="space-y-3 bg-brand-soft">
          <div>
            <p className="font-semibold text-body">{dict.driver.todayPending}</p>
            <p className="text-sm text-muted">{dict.driver.todayPendingHint}</p>
          </div>
          <Link
            href="/today"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-brand text-base font-semibold text-white shadow-sm transition hover:brightness-110"
          >
            {dict.driver.fileToday}
            <ArrowRight aria-hidden className="size-5" />
          </Link>
        </Card>
      )}

      {/* Their own earnings, stated as plainly as possible. */}
      <Card className="space-y-4">
        <div>
          <p className="text-sm text-muted">
            {dict.driver.thisMonth} · {dict.driver.yourPay}
          </p>
          <p className="tnum text-4xl font-semibold text-income">{formatMoney(pay)}</p>
        </div>

        <dl className="grid grid-cols-2 gap-2">
          <Stat label={dict.driver.daysWorked} value={String(worked)} />
          <Stat label={dict.driver.distance} value={formatKm(km)} />
          <Stat label={dict.driver.faresCollected} value={formatMoney(fares)} />
          <Stat label={dict.driver.avgPerDay} value={worked > 0 ? formatMoney(pay / worked) : "—"} />
        </dl>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-body">{dict.driver.myEarnings}</h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-xs text-muted">{dict.driver.accrued}</dt>
            <dd className="tnum mt-1 font-semibold text-body">{formatMoney(accrued)}</dd>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <dt className="text-xs text-muted">{dict.driver.paid}</dt>
            <dd className="tnum mt-1 font-semibold text-body">{formatMoney(paid)}</dd>
          </div>
          {/* Amber while money is owed, green once settled — same rule as the
              owner's driver ledger, so both read the hue the same way. */}
          <div
            className={cn("rounded-xl p-3", accrued - paid > 0 ? "bg-warn-soft" : "bg-income-soft")}
          >
            <dt className={cn("text-xs", accrued - paid > 0 ? "text-warn-deep" : "text-income-deep")}>
              {dict.driver.balance}
            </dt>
            <dd className="tnum mt-1 font-semibold text-body">{formatMoney(accrued - paid)}</dd>
          </div>
        </dl>
      </Card>

      {recent.length > 0 && (
        <Card className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-body">{dict.driver.recentDays}</h2>
            <Link href="/history" className="text-sm font-medium text-brand">
              {dict.driver.viewAll}
            </Link>
          </div>

          <ul className="divide-y divide-hairline">
            {recent.slice(0, 5).map((day) => (
              <li key={day.log_id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-body">{formatDate(day.log_date, locale)}</p>
                  <p className="text-xs text-muted">
                    {day.status === "worked"
                      ? formatKm(day.km)
                      : day.status === "repair"
                        ? dict.status.repair
                        : dict.status.off}
                  </p>
                </div>
                <span
                  className={cn(
                    "tnum text-sm font-semibold",
                    day.status === "worked" ? "text-body" : "text-muted",
                  )}
                >
                  {formatMoney(day.driver_amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <dt className="text-xs leading-snug text-muted">{label}</dt>
      <dd className="tnum mt-0.5 font-semibold text-body">{value}</dd>
    </div>
  );
}
