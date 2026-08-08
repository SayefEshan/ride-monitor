import Link from "next/link";
import { Download } from "lucide-react";

import { Card, EmptyState } from "@/components/ui";
import { platformTotals, summarize, withStandalone } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import {
  addDays,
  comparablePreviousMonth,
  formatKm,
  formatMoney,
  formatMonth,
  formatPercent,
  monthRange,
  todayInTimezone,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { DailySummary } from "@/lib/types";

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const session = await requireOwner();
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
  // For the in-progress month, compare like-for-like elapsed days — a partial
  // month against a full one reads as a profit collapse on every visit.
  const isCurrentMonth = month === today.slice(0, 7);
  const prevRange = isCurrentMonth
    ? comparablePreviousMonth(today)
    : monthRange(addDays(range.start, -1));

  const [
    { data: summaryRows, error: summaryError },
    { data: expenseRows, error: expenseError },
    { data: earningRows, error: earningError },
  ] = await Promise.all([
    supabase
      .from("daily_summary")
      .select("*")
      .gte("log_date", prevRange.start)
      .lte("log_date", range.end),
    // Spans the previous month too, so the month-on-month comparison counts
    // the same kinds of cost on both sides.
    supabase
      .from("expenses")
      .select("amount, expense_date, log_id, expense_categories(name, name_bn)")
      .gte("expense_date", prevRange.start)
      .lte("expense_date", range.end),
    supabase
      .from("log_earnings")
      .select("amount, platforms(name), daily_logs!inner(log_date)")
      .gte("daily_logs.log_date", range.start)
      .lte("daily_logs.log_date", range.end),
  ]);

  // Fail loudly rather than render a plausible report full of zeros.
  const queryError = summaryError ?? expenseError ?? earningError;
  if (queryError) throw new Error("report queries failed", { cause: queryError });

  const all = (summaryRows ?? []) as DailySummary[];

  const inMonth = (expenseRows ?? []).filter(
    (row) => row.expense_date >= range.start && row.expense_date <= range.end,
  );
  const inPrevMonth = (expenseRows ?? []).filter(
    (row) => row.expense_date >= prevRange.start && row.expense_date <= prevRange.end,
  );

  // Owner-entered costs (no log behind them) are folded in via the same
  // withStandalone() the dashboard uses, so the two screens can never quote
  // different profit for the same month.
  const standalone = (rows: typeof inMonth) =>
    rows
      .filter((row) => row.log_id === null)
      .map((row) => ({ expense_date: row.expense_date, amount: Number(row.amount) }));

  const totals = withStandalone(
    summarize(all.filter((row) => row.log_date >= range.start && row.log_date <= range.end)),
    standalone(inMonth),
  );
  const previous = withStandalone(
    summarize(all.filter((row) => row.log_date >= prevRange.start && row.log_date <= prevRange.end)),
    standalone(inPrevMonth),
  );

  const expenseTotal = totals.expense;
  const netProfit = totals.net;

  const byCategory = new Map<string, number>();
  for (const row of inMonth) {
    const category = row.expense_categories as unknown as {
      name: string;
      name_bn: string | null;
    } | null;
    const name = locale === "bn" && category?.name_bn ? category.name_bn : (category?.name ?? "—");
    byCategory.set(name, (byCategory.get(name) ?? 0) + Number(row.amount));
  }

  const categorySplit = [...byCategory.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      share: expenseTotal > 0 ? (amount / expenseTotal) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const platforms = platformTotals(
    (earningRows ?? []).map((row) => {
      const platform = row.platforms as unknown as { name: string } | null;
      return { platform: platform?.name ?? "—", amount: Number(row.amount ?? 0) };
    }),
  );

  const prevNet = previous.net;
  const change = prevNet !== 0 ? ((netProfit - prevNet) / Math.abs(prevNet)) * 100 : null;
  const perDay = totals.workedDays > 0 ? netProfit / totals.workedDays : 0;

  const prevMonth = prevRange.start.slice(0, 7);
  const nextMonth = monthRange(addDays(range.end, 1)).start.slice(0, 7);
  const canGoForward = `${nextMonth}-01` <= today;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-body">{dict.admin.monthlyReport}</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link
            href={`/reports?month=${prevMonth}`}
            aria-label={dict.common.prevMonth}
            className="rounded-lg border border-hairline px-3 py-1.5 text-body"
          >
            ←
          </Link>
          <span className="tnum min-w-28 text-center font-medium text-body">
            {formatMonth(range.start, locale)}
          </span>
          <Link
            href={canGoForward ? `/reports?month=${nextMonth}` : "/reports"}
            aria-label={dict.common.nextMonth}
            aria-disabled={!canGoForward}
            className={cn(
              "rounded-lg border border-hairline px-3 py-1.5 text-body",
              !canGoForward && "pointer-events-none opacity-40",
            )}
          >
            →
          </Link>
          <a
            href={`/reports/export?month=${month}`}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-hairline px-3 font-medium text-body"
          >
            <Download aria-hidden className="size-4" />
            {dict.admin.exportCsv}
          </a>
        </div>
      </header>

      {totals.workedDays === 0 && expenseTotal === 0 ? (
        <EmptyState title={dict.admin.noData} />
      ) : (
        <>
          <Card className="space-y-4">
            <div>
              <p className="text-sm text-muted">{dict.admin.netProfit}</p>
              <p
                className={cn(
                  "tnum text-4xl font-semibold",
                  netProfit >= 0 ? "text-body" : "text-expense",
                )}
              >
                {formatMoney(netProfit)}
              </p>
              {change !== null && (
                <p className={cn("mt-1 text-sm", change >= 0 ? "text-income-deep" : "text-expense")}>
                  {change >= 0 ? "▲" : "▼"} {formatPercent(Math.abs(change))}{" "}
                  {dict.admin.vsLastMonth}
                </p>
              )}
            </div>

            {/* A plain profit-and-loss statement: the owner should be able to
                read this to an accountant unchanged. */}
            <dl className="divide-y divide-hairline">
              <Row label={dict.admin.income} value={formatMoney(totals.income)} />
              <Row label={dict.admin.expense} value={`− ${formatMoney(expenseTotal)}`} />
              <Row label={dict.admin.driverPay} value={`− ${formatMoney(totals.driverPay)}`} />
              <Row label={dict.admin.netProfit} value={formatMoney(netProfit)} strong />
            </dl>

            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cell label={dict.admin.workingDays} value={String(totals.workedDays)} />
              <Cell label={dict.admin.distance} value={formatKm(totals.km)} />
              <Cell
                label={dict.admin.profitMargin}
                value={totals.income > 0 ? formatPercent(totals.margin) : "—"}
              />
              <Cell label={dict.admin.perWorkingDay} value={formatMoney(perDay)} />
            </dl>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.byCategory}
            </h2>
            {categorySplit.length === 0 ? (
              <p className="text-sm text-muted">{dict.admin.noExpenses}</p>
            ) : (
              <ul className="space-y-3">
                {categorySplit.map((item) => (
                  <li key={item.name} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-medium text-body">{item.name}</span>
                      <span className="tnum text-muted">
                        {formatMoney(item.amount)} · {formatPercent(item.share)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-expense"
                        style={{ width: `${Math.max(item.share, 1)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.platformBreakdown}
            </h2>
            {platforms.length === 0 ? (
              <p className="text-sm text-muted">{dict.admin.noData}</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {platforms.map((platform) => (
                  <li key={platform.name} className="flex justify-between py-2 text-sm">
                    <span className="font-medium text-body">{platform.name}</span>
                    <span className="tnum text-muted">
                      {formatMoney(platform.amount)} · {formatPercent(platform.share)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between py-2.5">
      <dt className={cn("text-sm", strong ? "font-semibold text-body" : "text-muted")}>{label}</dt>
      <dd className={cn("tnum text-sm", strong ? "font-semibold text-body" : "text-body")}>
        {value}
      </dd>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="tnum mt-0.5 font-semibold text-body">{value}</dd>
    </div>
  );
}
