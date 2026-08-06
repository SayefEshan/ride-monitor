import Link from "next/link";

import { Badge, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  addDays,
  formatDate,
  formatMoney,
  formatPercent,
  monthRange,
  todayInTimezone,
} from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { ExpenseCategory, Vehicle } from "@/lib/types";

import { ExpenseForm } from "./expense-form";

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount: number;
  note: string | null;
  log_id: string | null;
  expense_categories: { name: string; name_bn: string | null } | null;
};

export default async function ExpensesPage({ searchParams }: PageProps<"/expenses">) {
  const session = await requireOwner();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const today = todayInTimezone(session.org.timezone);
  const params = await searchParams;
  const anchor =
    typeof params.month === "string" && /^\d{4}-\d{2}$/.test(params.month)
      ? `${params.month}-01`
      : today;
  const range = monthRange(anchor);

  const [{ data: rows }, { data: vehicles }, { data: categories }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, expense_date, amount, note, log_id, expense_categories(name, name_bn)")
      .gte("expense_date", range.start)
      .lte("expense_date", range.end)
      .order("expense_date", { ascending: false }),
    supabase.from("vehicles").select("*").eq("is_active", true).order("created_at"),
    supabase.from("expense_categories").select("*").order("sort"),
  ]);

  const expenses = (rows ?? []) as unknown as ExpenseRow[];
  const label = (row: ExpenseRow) =>
    locale === "bn" && row.expense_categories?.name_bn
      ? row.expense_categories.name_bn
      : (row.expense_categories?.name ?? "—");

  const total = expenses.reduce((sum, row) => sum + Number(row.amount), 0);

  // Grouping answers "what are my biggest expenses?" without the owner
  // sorting anything by hand.
  const byCategory = new Map<string, number>();
  for (const row of expenses) {
    byCategory.set(label(row), (byCategory.get(label(row)) ?? 0) + Number(row.amount));
  }
  const grouped = [...byCategory.entries()]
    .map(([name, amount]) => ({ name, amount, share: total > 0 ? (amount / total) * 100 : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const previous = monthRange(addDays(range.start, -1)).start.slice(0, 7);
  const nextMonth = monthRange(addDays(range.end, 1)).start.slice(0, 7);
  const canGoForward = `${nextMonth}-01` <= today;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-body">{dict.admin.expenses}</h1>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href={`/expenses?month=${previous}`}
            aria-label="Previous month"
            className="rounded-lg border border-hairline px-3 py-1.5 text-body"
          >
            ←
          </Link>
          <span className="tnum min-w-28 text-center font-medium text-body">
            {formatDate(range.start, locale).replace(/^\d+\s/, "")}
          </span>
          <Link
            href={canGoForward ? `/expenses?month=${nextMonth}` : "/expenses"}
            aria-label="Next month"
            aria-disabled={!canGoForward}
            className={cn(
              "rounded-lg border border-hairline px-3 py-1.5 text-body",
              !canGoForward && "pointer-events-none opacity-40",
            )}
          >
            →
          </Link>
        </nav>
      </header>

      <Card className="space-y-4">
        <div>
          <p className="text-sm text-muted">{dict.admin.expense}</p>
          <p className="tnum text-3xl font-semibold text-body">{formatMoney(total)}</p>
        </div>

        {grouped.length > 0 && (
          <ul className="space-y-3">
            {grouped.map((group) => (
              <li key={group.name} className="space-y-1.5">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-medium text-body">{group.name}</span>
                  <span className="tnum text-muted">
                    {formatMoney(group.amount)} · {formatPercent(group.share)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full rounded-full bg-expense"
                    style={{ width: `${Math.max(group.share, 1)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            {dict.admin.addExpense}
          </h2>
          <p className="mt-1 text-sm text-muted">{dict.admin.standaloneHint}</p>
        </div>
        {(vehicles ?? []).length === 0 || (categories ?? []).length === 0 ? (
          <EmptyState title={dict.admin.noData} body="Add a vehicle in Settings first." />
        ) : (
          <ExpenseForm
            vehicles={(vehicles ?? []) as Vehicle[]}
            categories={(categories ?? []) as ExpenseCategory[]}
            today={today}
            dict={dict}
            locale={locale}
          />
        )}
      </Card>

      {expenses.length === 0 ? (
        <EmptyState title={dict.admin.noExpenses} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-hairline">
            {expenses.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-body">
                    {label(row)}
                    {row.note ? <span className="font-normal text-muted"> — {row.note}</span> : null}
                  </p>
                  <p className="text-xs text-muted">{formatDate(row.expense_date, locale)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Distinguishes what the driver logged from what the owner
                      entered, without making it the headline. */}
                  {row.log_id && <Badge>{dict.admin.logs}</Badge>}
                  <span className="tnum text-sm font-semibold text-body">
                    {formatMoney(row.amount)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
