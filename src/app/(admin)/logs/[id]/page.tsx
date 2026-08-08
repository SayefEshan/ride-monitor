import Link from "next/link";
import { notFound } from "next/navigation";
import Image from "next/image";
import { Pencil } from "lucide-react";

import { Badge, Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatKm, formatMoney, formatWeekday } from "@/lib/format";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";

export default async function LogDetailPage({ params }: PageProps<"/logs/[id]">) {
  await requireOwner();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();
  const { id } = await params;

  const { data: log } = await supabase
    .from("daily_logs")
    .select("*, vehicles(name)")
    .eq("id", id)
    .maybeSingle();

  if (!log) notFound();

  const [{ data: summary }, { data: earnings }, { data: expenses }, { data: attachments }] =
    await Promise.all([
      supabase.from("daily_summary").select("*").eq("log_id", id).maybeSingle(),
      supabase.from("log_earnings").select("amount, trips_count, platforms(name)").eq("log_id", id),
      supabase
        .from("expenses")
        .select("amount, note, expense_categories(name, name_bn)")
        .eq("log_id", id),
      supabase
        .from("attachments")
        .select("id, storage_path, label")
        .eq("parent_type", "daily_log")
        .eq("parent_id", id),
    ]);

  // Receipts live in a private bucket, so each one needs a short-lived signed
  // URL rather than a public link.
  const receipts: { id: string; url: string; label: string | null }[] = [];
  for (const attachment of attachments ?? []) {
    const { data: signed } = await supabase.storage
      .from("receipts")
      .createSignedUrl(attachment.storage_path, 60 * 10);
    if (signed?.signedUrl)
      receipts.push({ id: attachment.id, url: signed.signedUrl, label: attachment.label ?? null });
  }

  const vehicle = log.vehicles as unknown as { name: string } | null;
  const net = Number(summary?.net ?? 0);

  return (
    <div className="space-y-5">
      <Link href="/logs" className="text-sm text-muted underline">
        ← {dict.admin.logs}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-body">{formatDate(log.log_date, locale)}</h1>
          <p className="text-sm text-muted">
            {formatWeekday(log.log_date, locale)}
            {vehicle ? ` · ${vehicle.name}` : ""}
          </p>
        </div>

        <Link
          href={`/logs/new?date=${log.log_date}&vehicle=${log.vehicle_id}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-hairline px-3 text-sm font-medium text-body transition hover:bg-sunken"
        >
          <Pencil aria-hidden className="size-4" />
          {dict.admin.editReport}
        </Link>
      </header>

      {log.needs_review && (
        <p className="rounded-card bg-warn-soft px-4 py-3 text-sm font-medium text-warn-deep">
          {dict.admin.needsReview}
          {log.review_note ? ` — ${log.review_note}` : ""}
        </p>
      )}

      {log.status !== "worked" ? (
        <Card>
          <Badge>{dict.status[log.status as "off" | "repair"]}</Badge>
          {log.off_reason && <p className="mt-2 text-sm text-muted">{log.off_reason}</p>}
        </Card>
      ) : (
        <>
          <Card className="space-y-3">
            <p className="text-sm text-muted">{dict.admin.netProfit}</p>
            <p className={cn("tnum text-3xl font-semibold", net >= 0 ? "text-body" : "text-expense")}>
              {formatMoney(net)}
            </p>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Cell label={dict.admin.income} value={formatMoney(summary?.income)} />
              <Cell label={dict.admin.expense} value={formatMoney(summary?.expense)} />
              <Cell label={dict.admin.driverPay} value={formatMoney(log.driver_amount)} />
              <Cell label={dict.admin.distance} value={formatKm(log.km)} />
            </dl>
          </Card>

          <Card className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.platformBreakdown}
            </h2>
            {(earnings ?? []).length === 0 ? (
              <p className="text-sm text-muted">{dict.common.none}</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {(earnings ?? []).map((row, index) => {
                  const platform = row.platforms as unknown as { name: string } | null;
                  return (
                    <li key={index} className="flex justify-between py-2 text-sm">
                      <span className="text-body">{platform?.name ?? "—"}</span>
                      <span className="tnum font-medium text-body">{formatMoney(row.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.expenses}
            </h2>
            {(expenses ?? []).length === 0 ? (
              <p className="text-sm text-muted">{dict.common.none}</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {(expenses ?? []).map((row, index) => {
                  const category = row.expense_categories as unknown as {
                    name: string;
                    name_bn: string | null;
                  } | null;
                  return (
                    <li key={index} className="flex justify-between py-2 text-sm">
                      <span className="text-body">
                        {locale === "bn" && category?.name_bn ? category.name_bn : category?.name}
                        {row.note ? ` — ${row.note}` : ""}
                      </span>
                      <span className="tnum font-medium text-body">{formatMoney(row.amount)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}

      <Card className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.common.photo}
        </h2>
        {receipts.length === 0 ? (
          <EmptyState title={dict.driver.noDocuments} />
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {receipts.map((receipt, index) => (
              <li key={receipt.id}>
                <a href={receipt.url} target="_blank" rel="noreferrer">
                  <Image
                    src={receipt.url}
                    // These are evidence the owner reviews, not decoration.
                    alt={receipt.label ?? `${dict.common.photo} ${index + 1}`}
                    width={320}
                    height={320}
                    unoptimized
                    className="aspect-square w-full rounded-xl border border-hairline object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {log.note && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">
            {dict.common.note}
          </h2>
          <p className="text-sm text-body">{log.note}</p>
        </Card>
      )}
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
