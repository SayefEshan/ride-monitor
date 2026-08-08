import { Card, EmptyState } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatDate, formatMoney, todayInTimezone } from "@/lib/format";
import { formatPhone } from "@/lib/identity";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

import { PaymentForm } from "./payment-form";

export default async function DriversPage() {
  const session = await requireOwner();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();
  const today = todayInTimezone(session.org.timezone);

  const [{ data: people }, { data: days }, { data: payments }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "driver").order("created_at"),
    supabase.from("daily_summary").select("driver_id, driver_amount"),
    supabase
      .from("driver_payments")
      .select("id, driver_id, amount, paid_on, method, note")
      .order("paid_on", { ascending: false }),
  ]);

  const drivers = (people ?? []) as Profile[];

  // Earned comes from the days worked, paid from cash handed over. Holding
  // them apart is what makes the outstanding figure trustworthy.
  const accruedBy = new Map<string, number>();
  for (const day of days ?? []) {
    if (!day.driver_id) continue;
    accruedBy.set(day.driver_id, (accruedBy.get(day.driver_id) ?? 0) + Number(day.driver_amount));
  }

  const paidBy = new Map<string, number>();
  for (const payment of payments ?? []) {
    paidBy.set(payment.driver_id, (paidBy.get(payment.driver_id) ?? 0) + Number(payment.amount));
  }

  if (drivers.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-body">{dict.admin.drivers}</h1>
        <EmptyState title={dict.admin.noData} body={dict.admin.addDriverFirst} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-body">{dict.admin.drivers}</h1>

      {drivers.map((driver) => {
        const accrued = accruedBy.get(driver.id) ?? 0;
        const paid = paidBy.get(driver.id) ?? 0;
        const balance = accrued - paid;
        const history = (payments ?? []).filter((p) => p.driver_id === driver.id);

        return (
          <Card key={driver.id} className="space-y-5">
            <header>
              <h2 className="font-semibold text-body">{driver.full_name}</h2>
              <p className="text-xs text-muted">
                {formatPhone(driver.phone)} · {formatMoney(driver.pay_value)}/day
              </p>
            </header>

            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-surface px-3 py-2.5">
                <dt className="text-xs text-muted">{dict.admin.accrued}</dt>
                <dd className="tnum mt-0.5 font-semibold text-body">{formatMoney(accrued)}</dd>
              </div>
              <div className="rounded-xl bg-surface px-3 py-2.5">
                <dt className="text-xs text-muted">{dict.admin.paid}</dt>
                <dd className="tnum mt-0.5 font-semibold text-body">{formatMoney(paid)}</dd>
              </div>
              <div
                className={cn(
                  "rounded-xl px-3 py-2.5",
                  balance > 0 ? "bg-warn-soft" : "bg-income-soft",
                )}
              >
                <dt className={cn("text-xs", balance > 0 ? "text-warn-deep" : "text-income-deep")}>
                  {dict.admin.balanceDue}
                </dt>
                <dd
                  className={cn(
                    "tnum mt-0.5 font-semibold",
                    balance > 0 ? "text-body" : "text-income-deep",
                  )}
                >
                  {formatMoney(balance)}
                </dd>
              </div>
            </dl>

            <PaymentForm driverId={driver.id} today={today} suggested={balance} dict={dict} />

            <div>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {dict.admin.paymentHistory}
              </h3>
              {history.length === 0 ? (
                <p className="text-sm text-muted">{dict.admin.noPayments}</p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {history.slice(0, 8).map((payment) => (
                    <li key={payment.id} className="flex justify-between py-2 text-sm">
                      <span className="text-muted">
                        {formatDate(payment.paid_on, locale)}
                        {payment.method ? ` · ${payment.method}` : ""}
                      </span>
                      <span className="tnum font-medium text-body">
                        {formatMoney(payment.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
