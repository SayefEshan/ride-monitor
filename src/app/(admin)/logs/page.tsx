import Link from "next/link";
import { Plus } from "lucide-react";

import { Badge, Card, EmptyState } from "@/components/ui";
import { summarize } from "@/lib/analytics";
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
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { DailySummary } from "@/lib/types";

export default async function LogsPage({ searchParams }: PageProps<"/logs">) {
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

  const { data } = await supabase
    .from("daily_summary")
    .select("*")
    .gte("log_date", range.start)
    .lte("log_date", range.end)
    .order("log_date", { ascending: false });

  const days = (data ?? []) as DailySummary[];
  const totals = summarize(days);

  const previous = monthRange(addDays(range.start, -1)).start.slice(0, 7);
  const nextMonth = monthRange(addDays(range.end, 1)).start.slice(0, 7);
  const canGoForward = `${nextMonth}-01` <= today;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-body">{dict.admin.logs}</h1>
        <Link
          href={`/logs/new?date=${today}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-white transition hover:brightness-110"
        >
          <Plus aria-hidden className="size-4" />
          {dict.admin.addReport}
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href={`/logs?month=${previous}`}
            aria-label={dict.common.prevMonth}
            className="rounded-lg border border-hairline px-3 py-1.5 text-body"
          >
            ←
          </Link>
          <span className="tnum min-w-28 text-center font-medium text-body">
            {formatDate(range.start, locale).replace(/^\d+\s/, "")}
          </span>
          <Link
            href={canGoForward ? `/logs?month=${nextMonth}` : "/logs"}
            aria-label={dict.common.nextMonth}
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

      <Card>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Cell label={dict.admin.income} value={formatMoney(totals.income)} />
          <Cell label={dict.admin.expense} value={formatMoney(totals.expense + totals.driverPay)} />
          <Cell
            label={dict.admin.netProfit}
            value={formatMoney(totals.net)}
            tone={totals.net >= 0 ? "gain" : "loss"}
          />
          <Cell label={dict.admin.distance} value={formatKm(totals.km)} />
        </dl>
      </Card>

      {days.length === 0 ? (
        <EmptyState title={dict.admin.noData} />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-hairline">
            {days.map((day) => (
              <li key={day.log_id}>
                <Link
                  href={`/logs/${day.log_id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-surface"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-body">{formatDate(day.log_date, locale)}</p>
                    <p className="text-xs text-muted">
                      {day.status === "worked"
                        ? `${formatMoney(day.income)} · ${formatKm(day.km)}`
                        : dict.status[day.status]}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {day.needs_review && <Badge tone="warn">{dict.admin.needsReview}</Badge>}
                    <span
                      className={cn(
                        "tnum font-semibold",
                        Number(day.net) >= 0 ? "text-body" : "text-expense",
                      )}
                    >
                      {formatMoney(day.net)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd
        className={cn(
          "tnum mt-0.5 font-semibold",
          tone === "gain" ? "text-income-deep" : tone === "loss" ? "text-expense" : "text-body",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
