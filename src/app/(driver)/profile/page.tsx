import { Card, EmptyState } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/identity";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireDriver } from "@/lib/supabase/server";

export default async function ProfilePage() {
  const session = await requireDriver();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const [{ data: days }, { data: payments }, { data: documents }] = await Promise.all([
    supabase.from("daily_summary").select("driver_amount"),
    supabase
      .from("driver_payments")
      .select("id, amount, paid_on, method")
      .order("paid_on", { ascending: false }),
    supabase
      .from("documents")
      .select("id, doc_type, expires_on")
      .eq("owner_type", "driver")
      .eq("owner_id", session.userId),
  ]);

  // Accrued comes from the days worked; paid comes from what the owner has
  // actually handed over. Showing both removes the usual end-of-month argument.
  const accrued = (days ?? []).reduce((sum, d) => sum + Number(d.driver_amount ?? 0), 0);
  const paid = (payments ?? []).reduce((sum, p) => sum + Number(p.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-body">{dict.driver.profileTitle}</h1>

      <Card className="space-y-1">
        <p className="text-lg font-semibold text-body">{session.profile.full_name}</p>
        <p className="text-sm text-muted">{formatPhone(session.profile.phone)}</p>
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
          <div className="rounded-xl bg-profit-soft p-3">
            <dt className="text-xs text-profit-deep">{dict.driver.balance}</dt>
            <dd className="tnum mt-1 font-semibold text-body">{formatMoney(accrued - paid)}</dd>
          </div>
        </dl>

        {(payments ?? []).length > 0 && (
          <ul className="divide-y divide-hairline border-t border-hairline pt-1">
            {(payments ?? []).slice(0, 10).map((payment) => (
              <li key={payment.id} className="flex justify-between py-2 text-sm">
                <span className="text-muted">{formatDate(payment.paid_on, locale)}</span>
                <span className="tnum font-medium text-body">{formatMoney(payment.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-body">{dict.driver.documents}</h2>
        {(documents ?? []).length === 0 ? (
          <EmptyState title={dict.driver.noDocuments} />
        ) : (
          <ul className="divide-y divide-hairline">
            {(documents ?? []).map((doc) => (
              <li key={doc.id} className="flex justify-between py-2 text-sm">
                <span className="text-body">{doc.doc_type}</span>
                <span className="text-muted">
                  {doc.expires_on ? formatDate(doc.expires_on, locale) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
