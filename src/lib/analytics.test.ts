import assert from "node:assert/strict";
import { test } from "node:test";

import { comparablePreviousMonth } from "./format";
import { formatPhone, identifierToEmail, normalizeBdPhone } from "./identity";

import {
  buildInsights,
  platformTotals,
  summarize,
  toDailySeries,
  withStandalone,
} from "./analytics";
import type { DailySummary } from "./types";

/** A worked day with sane defaults; overrides express what each test is about. */
function day(overrides: Partial<DailySummary> & { log_date: string }): DailySummary {
  return {
    log_id: `log-${overrides.log_date}`,
    org_id: "org",
    vehicle_id: "vehicle",
    driver_id: "driver",
    status: "worked",
    km: 100,
    driver_amount: 300,
    needs_review: false,
    income: 3000,
    expense: 1500,
    fuel: 1200,
    net: 1200,
    ...overrides,
  };
}

test("summarize totals income, expenses and profit across days", () => {
  const totals = summarize([
    day({ log_date: "2026-01-01", income: 3000, expense: 1500, driver_amount: 300, km: 100 }),
    day({ log_date: "2026-01-02", income: 2000, expense: 1000, driver_amount: 300, km: 80 }),
  ]);

  assert.equal(totals.income, 5000);
  assert.equal(totals.expense, 2500);
  assert.equal(totals.driverPay, 600);
  assert.equal(totals.net, 1900); // 5000 - 2500 - 600
  assert.equal(totals.km, 180);
  assert.equal(totals.workedDays, 2);
});

test("summarize reports margin and per-kilometre rates", () => {
  const totals = summarize([
    day({
      log_date: "2026-01-01",
      income: 1000,
      expense: 400,
      driver_amount: 100,
      fuel: 300,
      km: 100,
    }),
  ]);

  assert.equal(totals.margin, 50); // 500 profit on 1000 income
  assert.equal(totals.fuelPerKm, 3);
  assert.equal(totals.incomePerKm, 10);
});

test("summarize leaves per-km rates null when nothing was driven", () => {
  const totals = summarize([day({ log_date: "2026-01-01", km: 0, status: "off" })]);

  assert.equal(totals.fuelPerKm, null);
  assert.equal(totals.incomePerKm, null);
  assert.equal(totals.workedDays, 0);
});

test("withStandalone folds owner-entered costs into profit and margin", () => {
  const base = summarize([
    day({ log_date: "2026-01-01", income: 5000, expense: 1500, driver_amount: 500 }),
  ]);
  assert.equal(base.net, 3000);

  // A workshop bill the driver never saw must still reduce profit.
  const merged = withStandalone(base, [{ expense_date: "2026-01-01", amount: 1000 }]);

  assert.equal(merged.expense, 2500);
  assert.equal(merged.net, 2000);
  assert.equal(merged.margin, 40);
  assert.equal(merged.income, base.income, "income is untouched");
});

test("withStandalone returns the totals unchanged when there are no extra costs", () => {
  const base = summarize([day({ log_date: "2026-01-01" })]);
  assert.deepEqual(withStandalone(base, []), base);
});

test("platformTotals ranks platforms and computes their share", () => {
  const result = platformTotals([
    { platform: "Uber", amount: 1000 },
    { platform: "Pathao", amount: 3000 },
    { platform: "Uber", amount: 1000 },
  ]);

  assert.deepEqual(
    result.map((r) => r.name),
    ["Pathao", "Uber"],
    "largest earner comes first",
  );
  assert.equal(result[0].amount, 3000);
  assert.equal(result[0].share, 60);
  assert.equal(result[1].amount, 2000);
});

test("toDailySeries emits every date in range, including days with no log", () => {
  const series = toDailySeries(
    [day({ log_date: "2026-01-02", income: 2000, expense: 500, driver_amount: 300 })],
    "2026-01-01",
    "2026-01-03",
  );

  assert.equal(series.length, 3);
  assert.deepEqual(series[0], { date: "2026-01-01", income: 0, expense: 0, net: 0 });
  assert.equal(series[1].income, 2000);
  assert.equal(series[1].expense, 800); // 500 expenses + 300 driver pay
  assert.equal(series[1].net, 1200);
});

test("toDailySeries attributes standalone costs to their own date", () => {
  const series = toDailySeries([], "2026-01-01", "2026-01-02", [
    { expense_date: "2026-01-02", amount: 4500 },
  ]);

  assert.equal(series[0].expense, 0);
  assert.equal(series[1].expense, 4500);
  assert.equal(series[1].net, -4500, "a cost with no income is a loss that day");
});

test("buildInsights flags a missing report for yesterday", () => {
  const insights = buildInsights({
    today: "2026-01-10",
    recent: [day({ log_date: "2026-01-08" })],
    thisMonth: summarize([day({ log_date: "2026-01-08" })]),
    lastMonth: summarize([]),
  });

  assert.ok(insights.some((i) => i.key === "missingLog" && i.values.date === "2026-01-09"));
});

test("buildInsights stays quiet when yesterday was reported", () => {
  const rows = [day({ log_date: "2026-01-09" })];
  const insights = buildInsights({
    today: "2026-01-10",
    recent: rows,
    thisMonth: summarize(rows),
    lastMonth: summarize([]),
  });

  assert.equal(insights.filter((i) => i.key === "missingLog").length, 0);
});

test("buildInsights flags a thin margin", () => {
  const rows = [day({ log_date: "2026-01-09", income: 1000, expense: 900, driver_amount: 50 })];
  const insights = buildInsights({
    today: "2026-01-10",
    recent: rows,
    thisMonth: summarize(rows),
    lastMonth: summarize([]),
  });

  assert.ok(insights.some((i) => i.key === "lowMargin"));
});

test("buildInsights flags a fuel spike only against a real baseline", () => {
  // The comparison is "last 7 days" against everything older, so the baseline
  // days must sit outside that window or they dilute the spike.
  const baseline = Array.from({ length: 20 }, (_, i) =>
    day({ log_date: `2026-01-${String(i + 1).padStart(2, "0")}`, km: 100, fuel: 1000 }),
  );
  const spike = ["2026-01-29", "2026-01-30", "2026-01-31"].map((date) =>
    day({ log_date: date, km: 100, fuel: 2000 }),
  );

  const insights = buildInsights({
    today: "2026-01-31",
    recent: [...baseline, ...spike],
    thisMonth: summarize([...baseline, ...spike]),
    lastMonth: summarize([]),
  });

  const spikeInsight = insights.find((i) => i.key === "fuelSpike");
  assert.ok(spikeInsight, "a doubling of fuel cost per km should be reported");
  assert.equal(spikeInsight.values.pct, 100); // 20/km against a 10/km baseline
});

test("buildInsights will not cry wolf on a handful of days", () => {
  const rows = [
    day({ log_date: "2026-01-08", km: 100, fuel: 1000 }),
    day({ log_date: "2026-01-09", km: 100, fuel: 5000 }),
  ];

  const insights = buildInsights({
    today: "2026-01-10",
    recent: rows,
    thisMonth: summarize(rows),
    lastMonth: summarize([]),
  });

  assert.equal(insights.filter((i) => i.key === "fuelSpike").length, 0);
});

test("a driver's phone maps to the same login email whichever way they type it", () => {
  const expected = "8801712345678@drivers.ridemonitor.app";
  for (const typed of ["01712345678", "+8801712345678", "8801712345678", "017 1234 5678"]) {
    assert.equal(identifierToEmail(typed), expected, `failed for "${typed}"`);
  }
});

test("normalizeBdPhone rejects anything that is not a Bangladeshi mobile", () => {
  assert.equal(normalizeBdPhone("0171234567"), null, "too short");
  assert.equal(normalizeBdPhone("02712345678"), null, "not an 01 prefix");
  assert.equal(normalizeBdPhone("hello"), null);
});

test("formatPhone drops the trunk zero, not a real digit", () => {
  // 01712345678 is +880 1712-345678 internationally — never +880 0171-…
  assert.equal(formatPhone("8801712345678"), "+880 1712-345678");
  assert.equal(formatPhone(null), "—");
});

test("comparablePreviousMonth clips last month to the days elapsed so far", () => {
  // Four days of August must be compared with four days of July, not all 31.
  assert.deepEqual(comparablePreviousMonth("2026-08-04"), {
    start: "2026-07-01",
    end: "2026-07-04",
  });
});

test("comparablePreviousMonth clamps to a shorter previous month", () => {
  // There is no 31 February to compare the 31st of March against.
  assert.deepEqual(comparablePreviousMonth("2026-03-31"), {
    start: "2026-02-01",
    end: "2026-02-28",
  });
});

test("comparablePreviousMonth crosses the year boundary", () => {
  assert.deepEqual(comparablePreviousMonth("2026-01-10"), {
    start: "2025-12-01",
    end: "2025-12-10",
  });
});

test("buildInsights flags a month-on-month profit collapse", () => {
  const thisMonthRows = [
    day({ log_date: "2026-02-09", income: 1000, expense: 100, driver_amount: 0 }),
  ];
  const lastMonthRows = [
    day({ log_date: "2026-01-09", income: 10000, expense: 1000, driver_amount: 0 }),
  ];

  const insights = buildInsights({
    today: "2026-02-10",
    recent: thisMonthRows,
    thisMonth: summarize(thisMonthRows),
    lastMonth: summarize(lastMonthRows),
  });

  assert.ok(insights.some((i) => i.key === "profitDrop"));
});
