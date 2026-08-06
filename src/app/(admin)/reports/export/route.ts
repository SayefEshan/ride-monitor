import { NextResponse, type NextRequest } from "next/server";

import { monthRange, todayInTimezone } from "@/lib/format";
import { createSupabaseServerClient, getSessionContext } from "@/lib/supabase/server";
import type { DailySummary } from "@/lib/types";

/** Wraps a field only when it could otherwise break the row. */
function csvCell(value: string | number | null): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One row per day of the requested month, for an accountant or a spreadsheet.
 *
 * A route handler rather than a server action because the browser needs a real
 * file download. Authorisation is re-checked here — a route handler is a
 * public endpoint, so it cannot lean on the layout's `requireOwner`.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionContext();
  if (!session || session.profile.role !== "owner") {
    return new NextResponse("Not found", { status: 404 });
  }

  const requested = request.nextUrl.searchParams.get("month");
  const today = todayInTimezone(session.org.timezone);
  const month = requested && /^\d{4}-\d{2}$/.test(requested) ? requested : today.slice(0, 7);
  const range = monthRange(`${month}-01`);

  const supabase = await createSupabaseServerClient();

  const [{ data: summaryRows }, { data: standaloneRows }] = await Promise.all([
    supabase
      .from("daily_summary")
      .select("*")
      .gte("log_date", range.start)
      .lte("log_date", range.end)
      .order("log_date", { ascending: true }),
    // Owner-entered costs have no log_id and may fall on a day with no
    // driving at all, so they need their own rows or the file would not
    // reconcile with the on-screen report.
    supabase
      .from("expenses")
      .select("expense_date, amount")
      .is("log_id", null)
      .gte("expense_date", range.start)
      .lte("expense_date", range.end),
  ]);

  const rows = (summaryRows ?? []) as DailySummary[];

  const extraByDate = new Map<string, number>();
  for (const row of standaloneRows ?? []) {
    extraByDate.set(
      row.expense_date,
      (extraByDate.get(row.expense_date) ?? 0) + Number(row.amount ?? 0),
    );
  }

  const dates = [
    ...new Set([...rows.map((row) => row.log_date), ...extraByDate.keys()]),
  ].sort();

  const byDate = new Map(rows.map((row) => [row.log_date, row]));

  const header = ["Date", "Status", "Distance (km)", "Income", "Expenses", "Driver pay", "Net"];
  const body: string[][] = [];
  const totals = { km: 0, income: 0, expense: 0, driver: 0, net: 0 };

  for (const date of dates) {
    const row = byDate.get(date);
    const income = Number(row?.income ?? 0);
    const expense = Number(row?.expense ?? 0) + (extraByDate.get(date) ?? 0);
    const driver = Number(row?.driver_amount ?? 0);
    const km = Number(row?.km ?? 0);
    const net = income - expense - driver;

    body.push(
      [date, row?.status ?? "expense only", row?.km ?? "", income, expense, driver, net].map(
        csvCell,
      ),
    );

    totals.km += km;
    totals.income += income;
    totals.expense += expense;
    totals.driver += driver;
    totals.net += net;
  }

  const csv = [
    header.join(","),
    ...body.map((row) => row.join(",")),
    ["Total", "", totals.km, totals.income, totals.expense, totals.driver, totals.net]
      .map(csvCell)
      .join(","),
  ].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ride-monitor-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
