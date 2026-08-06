import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Fuel, Route, TrendingUp, Wallet } from "lucide-react";

import { MoneyFlow } from "@/components/admin/money-flow";
import { TrendChart } from "@/components/admin/trend-chart";
import { WeekdayChart, type WeekdayPoint } from "@/components/admin/weekday-chart";
import { Badge, Card, EmptyState } from "@/components/ui";
import {
  buildInsights,
  platformTotals,
  summarize,
  toDailySeries,
  withStandalone,
  type StandaloneExpense,
} from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  comparablePreviousMonth,
  formatDate,
  formatKm,
  formatMoney,
  formatPercent,
  lastNDays,
  monthRange,
  todayInTimezone,
} from "@/lib/format";
import { getDictionary, t } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { DailySummary } from "@/lib/types";

const SERIES = ["bg-series-1", "bg-series-2", "bg-series-3", "bg-series-4", "bg-series-5"] as const;

export default async function DashboardPage() {
  const session = await requireOwner();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const today = todayInTimezone(session.org.timezone);
  const thisMonth = monthRange(today);
  // Clipped to the same day count, so an early-month comparison is fair.
  const lastMonth = comparablePreviousMonth(today);
  const window30 = lastNDays(today, 30);
  const window90 = lastNDays(today, 90);

  const from = [lastMonth.start, window90.start].sort()[0];

  const [{ data: summaryRows }, { data: earningRows }, { data: standaloneRows }] =
    await Promise.all([
      supabase
        .from("daily_summary")
        .select("*")
        .gte("log_date", from)
        .lte("log_date", today)
        .order("log_date", { ascending: true }),
      supabase
        .from("log_earnings")
        .select("amount, platforms(name), daily_logs!inner(log_date)")
        .gte("daily_logs.log_date", thisMonth.start)
        .lte("daily_logs.log_date", today),
      // Owner-entered costs carry no log_id, so daily_summary cannot see them.
      supabase
        .from("expenses")
        .select("expense_date, amount")
        .is("log_id", null)
        .gte("expense_date", from)
        .lte("expense_date", today),
    ]);

  const all = (summaryRows ?? []) as DailySummary[];
  const standalone = (standaloneRows ?? []) as StandaloneExpense[];

  const inRange = (start: string, end: string) =>
    all.filter((row) => row.log_date >= start && row.log_date <= end);
  const extraInRange = (start: string, end: string) =>
    standalone.filter((row) => row.expense_date >= start && row.expense_date <= end);

  const todayTotals = withStandalone(summarize(inRange(today, today)), extraInRange(today, today));
  const monthTotals = withStandalone(
    summarize(inRange(thisMonth.start, thisMonth.end)),
    extraInRange(thisMonth.start, thisMonth.end),
  );
  const lastMonthTotals = withStandalone(
    summarize(inRange(lastMonth.start, lastMonth.end)),
    extraInRange(lastMonth.start, lastMonth.end),
  );
  const recent = inRange(window30.start, window30.end);

  const insights = buildInsights({
    today,
    recent,
    thisMonth: monthTotals,
    lastMonth: lastMonthTotals,
  });

  const series = toDailySeries(
    recent,
    window30.start,
    window30.end,
    extraInRange(window30.start, window30.end),
  );

  const platforms = platformTotals(
    (earningRows ?? []).map((row) => {
      const platform = row.platforms as unknown as { name: string } | null;
      return { platform: platform?.name ?? "—", amount: Number(row.amount ?? 0) };
    }),
  );

  const weekdays = averageByWeekday(inRange(window90.start, window90.end));
  const todayLog = all.find((row) => row.log_date === today);
  const recentDays = [...all].reverse().slice(0, 6);
  const monthChange =
    lastMonthTotals.net !== 0
      ? ((monthTotals.net - lastMonthTotals.net) / Math.abs(lastMonthTotals.net)) * 100
      : null;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted">
            {dict.admin.today}
          </p>
          <h1 className="text-2xl font-semibold text-body">{formatDate(today, locale)}</h1>
        </div>
        {/* Actionable, not just informative: the owner can file the missing
            day here rather than waiting on a report that may never come. */}
        {!todayLog && (
          <Link
            href={`/logs/new?date=${today}`}
            className="inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1.5 text-xs font-medium text-warn-deep transition hover:brightness-95"
          >
            {dict.admin.noLogToday}
            <span className="font-semibold underline underline-offset-2">
              {dict.admin.fileThisDay}
            </span>
          </Link>
        )}
        {todayLog?.status === "off" && <Badge>{dict.admin.carOffToday}</Badge>}
      </header>

      {/* The hero states the day's outcome, then shows how it was arrived at. */}
      <Card className="space-y-5 border-0 bg-linear-to-br from-raised to-sunken">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{dict.admin.netProfit}</p>
            <p
              className={cn(
                "tnum text-5xl font-bold leading-none sm:text-6xl",
                todayTotals.net >= 0 ? "text-body" : "text-expense",
              )}
            >
              {formatMoney(todayTotals.net)}
            </p>
          </div>
          <dl className="flex gap-5">
            <MiniStat
              label={dict.admin.distance}
              value={formatKm(todayTotals.km)}
              icon={<Route className="size-3.5" />}
            />
            <MiniStat
              label={dict.admin.fuel}
              value={formatMoney(todayTotals.fuel)}
              icon={<Fuel className="size-3.5" />}
            />
          </dl>
        </div>

        <MoneyFlow
          income={todayTotals.income}
          expense={todayTotals.expense}
          driverPay={todayTotals.driverPay}
          labels={{
            income: dict.admin.income,
            expense: dict.admin.expense,
            driverPay: dict.admin.driverPay,
            profit: dict.admin.netProfit,
          }}
        />
      </Card>

      {insights.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {insights.map((insight) => (
            <li
              key={insight.key}
              className={cn(
                "rounded-card border-l-4 px-4 py-3 text-sm font-medium",
                insight.tone === "loss"
                  ? "border-expense bg-expense-soft text-expense-deep"
                  : "border-warn bg-warn-soft text-warn-deep",
              )}
            >
              {t(dict.insight[insight.key], {
                ...insight.values,
                ...(insight.values.date
                  ? { date: formatDate(String(insight.values.date), locale) }
                  : {}),
              })}
            </li>
          ))}
        </ul>
      )}

      {/* Month at a glance. Each tile carries the hue of the thing it measures. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label={`${dict.admin.income} · ${dict.admin.thisMonth}`}
          value={formatMoney(monthTotals.income)}
          accent="income"
          icon={<TrendingUp className="size-4" />}
        />
        <Tile
          label={`${dict.admin.expense} · ${dict.admin.thisMonth}`}
          value={formatMoney(monthTotals.expense + monthTotals.driverPay)}
          accent="expense"
          icon={<Wallet className="size-4" />}
        />
        <Tile
          label={`${dict.admin.netProfit} · ${dict.admin.thisMonth}`}
          value={formatMoney(monthTotals.net)}
          accent="profit"
          icon={<ArrowUpRight className="size-4" />}
          delta={monthChange}
        />
        <Tile
          label={`${dict.admin.fuel} / ${dict.admin.perKm}`}
          value={monthTotals.fuelPerKm ? formatMoney(monthTotals.fuelPerKm, { paisa: true }) : "—"}
          accent="distance"
          icon={<Fuel className="size-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-3">
          <CardHead title={dict.admin.profitTrend} note="Last 30 days" />
          {series.some((point) => point.income > 0) ? (
            <TrendChart data={series} locale={locale} />
          ) : (
            <EmptyState title={dict.admin.noData} />
          )}
        </Card>

        <Card className="space-y-3">
          <CardHead title="Profit by weekday" note="Average, last 90 days" />
          {weekdays.some((point) => point.days > 0) ? (
            <WeekdayChart data={weekdays} />
          ) : (
            <EmptyState title={dict.admin.noData} />
          )}
        </Card>

        <Card className="space-y-4">
          <CardHead title={dict.admin.platformBreakdown} note={dict.admin.thisMonth} />
          {platforms.length === 0 ? (
            <EmptyState title={dict.admin.noData} />
          ) : (
            <ul className="space-y-3.5">
              {platforms.map((platform, index) => (
                <li key={platform.name} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-body">{platform.name}</span>
                    <span className="tnum shrink-0 text-muted">
                      {formatMoney(platform.amount)}
                      <span className="ml-1.5 text-xs">{formatPercent(platform.share)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-sunken">
                    <div
                      className={cn(
                        "animate-bar h-full rounded-full",
                        SERIES[index % SERIES.length],
                      )}
                      style={{
                        width: `${Math.max(platform.share, 1.5)}%`,
                        animationDelay: `${index * 80}ms`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="space-y-3">
          <CardHead
            title={dict.admin.recentLogs}
            action={
              <Link
                href="/logs"
                className="text-sm font-medium text-muted underline-offset-4 hover:text-body hover:underline"
              >
                {dict.admin.viewAll}
              </Link>
            }
          />
          {recentDays.length === 0 ? (
            <EmptyState title={dict.admin.noData} />
          ) : (
            <ul className="divide-y divide-hairline">
              {recentDays.map((row) => (
                <li key={row.log_id}>
                  <Link
                    href={`/logs/${row.log_id}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition hover:bg-sunken"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-body">
                        {formatDate(row.log_date, locale)}
                      </p>
                      <p className="text-xs text-muted">
                        {row.status === "worked"
                          ? `${formatMoney(row.income)} · ${formatKm(row.km)}`
                          : dict.status[row.status]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {row.needs_review && <Badge tone="warn">{dict.admin.needsReview}</Badge>}
                      <span
                        className={cn(
                          "tnum text-sm font-semibold",
                          Number(row.net) >= 0 ? "text-body" : "text-expense",
                        )}
                      >
                        {formatMoney(row.net)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Mean profit per weekday, so noisy single days do not dominate the shape. */
function averageByWeekday(rows: DailySummary[]): WeekdayPoint[] {
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const buckets = names.map((day) => ({ day, total: 0, days: 0 }));

  for (const row of rows) {
    if (row.status !== "worked") continue;
    const [y, m, d] = row.log_date.split("-").map(Number);
    const index = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    buckets[index].total += Number(row.net ?? 0);
    buckets[index].days += 1;
  }

  return buckets.map((bucket) => ({
    day: bucket.day,
    days: bucket.days,
    net: bucket.days > 0 ? Math.round(bucket.total / bucket.days) : 0,
  }));
}

function CardHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold text-body">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {action}
    </div>
  );
}

const ACCENTS = {
  income: "bg-income-soft text-income-deep",
  expense: "bg-expense-soft text-expense-deep",
  profit: "bg-profit-soft text-profit-deep",
  distance: "bg-distance-soft text-distance",
} as const;

function Tile({
  label,
  value,
  accent,
  icon,
  delta,
}: {
  label: string;
  value: string;
  accent: keyof typeof ACCENTS;
  icon: ReactNode;
  delta?: number | null;
}) {
  return (
    <div className="rounded-card border border-hairline bg-raised p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-snug text-muted">{label}</p>
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", ACCENTS[accent])}>
          {icon}
        </span>
      </div>
      <p className="tnum mt-2 text-xl font-semibold text-body sm:text-2xl">{value}</p>
      {delta !== null && delta !== undefined && (
        <p
          className={cn(
            "mt-0.5 text-xs font-medium",
            delta >= 0 ? "text-income-deep" : "text-expense-deep",
          )}
        >
          {delta >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(delta))} vs same days last month
        </p>
      )}
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted">
        {icon}
        {label}
      </dt>
      <dd className="tnum mt-0.5 font-semibold text-body">{value}</dd>
    </div>
  );
}
