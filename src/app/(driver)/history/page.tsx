import Link from "next/link";

import { Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDate,
  formatKm,
  formatMoney,
  formatMonth,
  monthRange,
  todayInTimezone,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireDriver } from "@/lib/supabase/server";
import type { DailySummary } from "@/lib/types";

/**
 * The driver's monthly report.
 *
 * A flat list of every day ever worked answered no question the driver
 * actually has. One month at a time, led by what they earned in it, does:
 * "what did I make in July, and which days made it."
 *
 * Only columns the driver reported themselves are selected — never `net` or
 * `expense`, which describe the business rather than their day.
 */
type DriverDay = Pick<
  DailySummary,
  "log_id" | "log_date" | "status" | "km" | "income" | "driver_amount"
>;

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const session = await requireDriver();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const today = todayInTimezone(session.org.timezone);
  const params = await searchParams;
  const month =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : today.slice(0, 7);
  const range = monthRange(`${month}-01`);

  const { data } = await supabase
    .from("daily_summary")
    .select("log_id, log_date, status, km, income, driver_amount")
    .gte("log_date", range.start)
    .lte("log_date", range.end)
    .order("log_date", { ascending: false });

  const days = (data ?? []) as DriverDay[];

  const pay = days.reduce((sum, day) => sum + Number(day.driver_amount ?? 0), 0);
  const fares = days.reduce((sum, day) => sum + Number(day.income ?? 0), 0);
  const km = days.reduce((sum, day) => sum + Number(day.km ?? 0), 0);
  const worked = days.filter((day) => day.status === "worked").length;
  const off = days.length - worked;

  // Bars scale on fares, not pay: a driver on fixed daily pay earns the same
  // every day, so a pay-scaled bar would be full width on every row and say
  // nothing. Fares vary, and are the figure printed on the same line.
  const bestDay = days.reduce((max, day) => Math.max(max, Number(day.income ?? 0)), 0);

  const prevMonth = monthRange(addDays(range.start, -1)).start.slice(0, 7);
  const nextMonth = monthRange(addDays(range.end, 1)).start.slice(0, 7);
  const canGoForward = `${nextMonth}-01` <= today;

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <h1 className="text-lg font-semibold text-body">{dict.driver.historyTitle}</h1>

        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/history?month=${prevMonth}`}
            aria-label="Previous month"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-hairline text-body"
          >
            ←
          </Link>
          <span className="tnum flex-1 text-center font-semibold text-body">
            {formatMonth(range.start, locale)}
          </span>
          <Link
            href={canGoForward ? `/history?month=${nextMonth}` : "/history"}
            aria-label="Next month"
            aria-disabled={!canGoForward}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl border border-hairline text-body",
              !canGoForward && "pointer-events-none opacity-40",
            )}
          >
            →
          </Link>
        </div>
      </header>

      {days.length === 0 ? (
        <EmptyState title={dict.driver.monthEmpty} />
      ) : (
        <>
          <Card className="space-y-4">
            <div>
              <p className="text-sm text-muted">{dict.driver.yourPay}</p>
              <p className="tnum text-4xl font-semibold text-income">{formatMoney(pay)}</p>
            </div>

            <dl className="grid grid-cols-2 gap-2">
              <Stat label={dict.driver.daysWorked} value={String(worked)} />
              <Stat label={dict.driver.daysOff} value={String(off)} />
              <Stat label={dict.driver.distance} value={formatKm(km)} />
              <Stat label={dict.driver.faresCollected} value={formatMoney(fares)} />
            </dl>
          </Card>

          <Card className="space-y-1">
            <h2 className="mb-2 font-semibold text-body">{dict.driver.recentDays}</h2>

            <ul className="divide-y divide-hairline">
              {days.map((day) => {
                const amount = Number(day.driver_amount ?? 0);
                const share = bestDay > 0 ? (Number(day.income ?? 0) / bestDay) * 100 : 0;

                return (
                  <li key={day.log_id} className="space-y-1.5 py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-body">
                          {formatDate(day.log_date, locale)}
                        </p>
                        <p className="text-xs text-muted">
                          {day.status === "worked"
                            ? `${formatKm(day.km)} · ${formatMoney(day.income)}`
                            : day.status === "repair"
                              ? dict.status.repair
                              : dict.status.off}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "tnum shrink-0 text-sm font-semibold",
                          day.status === "worked" ? "text-body" : "text-muted",
                        )}
                      >
                        {formatMoney(amount)}
                      </span>
                    </div>

                    {/* A bar per day: the month's rhythm without a chart library. */}
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-income"
                        style={{ width: `${Math.max(share, 0)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
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
