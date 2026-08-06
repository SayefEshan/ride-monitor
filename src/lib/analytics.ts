import { addDays, daysBetween } from "./format";
import type { DailySummary } from "./types";

export type SummaryTotals = {
  income: number;
  expense: number;
  fuel: number;
  driverPay: number;
  net: number;
  km: number;
  workedDays: number;
  /** Take-home share of income. The single number that says whether the day paid. */
  margin: number;
  /** Fuel cost per kilometre — the earliest warning that something is wrong. */
  fuelPerKm: number | null;
  incomePerKm: number | null;
};

export function summarize(rows: DailySummary[]): SummaryTotals {
  const totals = rows.reduce(
    (acc, row) => {
      acc.income += Number(row.income ?? 0);
      acc.expense += Number(row.expense ?? 0);
      acc.fuel += Number(row.fuel ?? 0);
      acc.driverPay += Number(row.driver_amount ?? 0);
      acc.km += Number(row.km ?? 0);
      if (row.status === "worked") acc.workedDays += 1;
      return acc;
    },
    { income: 0, expense: 0, fuel: 0, driverPay: 0, km: 0, workedDays: 0 },
  );

  const net = totals.income - totals.expense - totals.driverPay;

  return {
    ...totals,
    net,
    margin: totals.income > 0 ? (net / totals.income) * 100 : 0,
    fuelPerKm: totals.km > 0 ? totals.fuel / totals.km : null,
    incomePerKm: totals.km > 0 ? totals.income / totals.km : null,
  };
}

/** An expense the owner entered directly, with no daily log behind it. */
export type StandaloneExpense = { expense_date: string; amount: number };

/**
 * Folds owner-entered costs into a set of totals.
 *
 * `daily_summary` only sums expenses attached to a daily log, because that is
 * all a driver can create. A workshop bill or an insurance renewal would
 * otherwise show up in the monthly report but not on the dashboard, and the
 * two screens would quote different profit for the same month.
 */
export function withStandalone(
  totals: SummaryTotals,
  standalone: StandaloneExpense[],
): SummaryTotals {
  const extra = standalone.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  if (extra === 0) return totals;

  const expense = totals.expense + extra;
  const net = totals.income - expense - totals.driverPay;

  return {
    ...totals,
    expense,
    net,
    margin: totals.income > 0 ? (net / totals.income) * 100 : 0,
  };
}

export type PlatformTotal = { name: string; amount: number; share: number };

/** Income by platform, largest first — answers "which app is actually paying?" */
export function platformTotals(rows: { platform: string; amount: number }[]): PlatformTotal[] {
  const byPlatform = new Map<string, number>();
  for (const row of rows) {
    byPlatform.set(row.platform, (byPlatform.get(row.platform) ?? 0) + Number(row.amount ?? 0));
  }

  const total = [...byPlatform.values()].reduce((sum, v) => sum + v, 0);
  return [...byPlatform.entries()]
    .map(([name, amount]) => ({
      name,
      amount,
      share: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

export type Insight = {
  key: "missingLog" | "fuelSpike" | "lowMargin" | "profitDrop";
  tone: "warn" | "loss";
  values: Record<string, string | number>;
};

/**
 * Turns the numbers into the handful of things worth acting on. Deliberately
 * conservative: an alert the owner learns to ignore is worse than no alert.
 */
export function buildInsights(input: {
  today: string;
  recent: DailySummary[];
  thisMonth: SummaryTotals;
  lastMonth: SummaryTotals;
}): Insight[] {
  const insights: Insight[] = [];
  const { today, recent, thisMonth, lastMonth } = input;

  // A day with no report at all. Yesterday, not today — the driver files in
  // the evening, so flagging today would fire every morning.
  const yesterday = addDays(today, -1);
  const hasYesterday = recent.some((row) => row.log_date === yesterday);
  if (!hasYesterday && recent.length > 0) {
    insights.push({ key: "missingLog", tone: "warn", values: { date: yesterday } });
  }

  // Fuel per km against the preceding 30 days, needing a real baseline before
  // it will speak up.
  const worked = recent.filter((row) => row.status === "worked" && Number(row.km ?? 0) > 0);
  if (worked.length >= 10) {
    const recentWindow = worked.filter((row) => daysBetween(row.log_date, today) <= 7);
    const baseline = worked.filter((row) => daysBetween(row.log_date, today) > 7);

    if (recentWindow.length >= 3 && baseline.length >= 5) {
      const rate = (rows: DailySummary[]) => {
        const fuel = rows.reduce((sum, r) => sum + Number(r.fuel ?? 0), 0);
        const km = rows.reduce((sum, r) => sum + Number(r.km ?? 0), 0);
        return km > 0 ? fuel / km : 0;
      };
      const current = rate(recentWindow);
      const previous = rate(baseline);
      if (previous > 0 && current > previous * 1.2) {
        insights.push({
          key: "fuelSpike",
          tone: "warn",
          values: { pct: Math.round(((current - previous) / previous) * 100), days: 30 },
        });
      }
    }
  }

  if (thisMonth.income > 0 && thisMonth.margin < 15) {
    insights.push({ key: "lowMargin", tone: "loss", values: { pct: Math.round(thisMonth.margin) } });
  }

  if (lastMonth.net > 0 && thisMonth.net < lastMonth.net * 0.8) {
    insights.push({
      key: "profitDrop",
      tone: "loss",
      values: { pct: Math.round(((lastMonth.net - thisMonth.net) / lastMonth.net) * 100) },
    });
  }

  return insights;
}

/** Fills gaps so a chart shows unworked days as zero rather than skipping them. */
export function toDailySeries(
  rows: DailySummary[],
  start: string,
  end: string,
  standalone: StandaloneExpense[] = [],
): { date: string; income: number; expense: number; net: number }[] {
  const byDate = new Map(rows.map((row) => [row.log_date, row]));

  const extraByDate = new Map<string, number>();
  for (const row of standalone) {
    extraByDate.set(
      row.expense_date,
      (extraByDate.get(row.expense_date) ?? 0) + Number(row.amount ?? 0),
    );
  }

  const series: { date: string; income: number; expense: number; net: number }[] = [];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    const row = byDate.get(date);
    const income = Number(row?.income ?? 0);
    const expense =
      Number(row?.expense ?? 0) + Number(row?.driver_amount ?? 0) + (extraByDate.get(date) ?? 0);
    series.push({ date, income, expense, net: income - expense });
  }

  return series;
}
