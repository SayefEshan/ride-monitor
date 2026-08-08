import { Card, EmptyState } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { formatPhone } from "@/lib/identity";
import { getDictionary } from "@/lib/i18n";
import { createSupabaseServerClient, getLocale, requireOwner } from "@/lib/supabase/server";
import type { Profile, Vehicle } from "@/lib/types";

import { AddDriverForm, AddVehicleForm } from "./settings-forms";

export default async function SettingsPage() {
  const session = await requireOwner();
  const locale = await getLocale();
  const dict = getDictionary(locale);
  const supabase = await createSupabaseServerClient();

  const [{ data: vehicles }, { data: people }] = await Promise.all([
    supabase.from("vehicles").select("*").order("created_at"),
    supabase.from("profiles").select("*").eq("role", "driver").order("created_at"),
  ]);

  const vehicleList = (vehicles ?? []) as Vehicle[];
  const drivers = (people ?? []) as Profile[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-body">{dict.admin.settings}</h1>
        <p className="text-sm text-muted">{session.org.name}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.vehicle}
            </h2>
            {vehicleList.length === 0 ? (
              <EmptyState title={dict.admin.noData} />
            ) : (
              <ul className="divide-y divide-hairline">
                {vehicleList.map((vehicle) => (
                  <li key={vehicle.id} className="flex justify-between py-2.5 text-sm">
                    <span className="font-medium text-body">{vehicle.name}</span>
                    <span className="text-muted">{vehicle.plate_no ?? vehicle.fuel_type}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.addVehicle}
            </h2>
            <AddVehicleForm dict={dict} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.drivers}
            </h2>
            {drivers.length === 0 ? (
              <EmptyState title={dict.admin.noData} />
            ) : (
              <ul className="divide-y divide-hairline">
                {drivers.map((driver) => (
                  <li key={driver.id} className="flex justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-body">{driver.full_name}</p>
                      <p className="text-xs text-muted">{formatPhone(driver.phone)}</p>
                    </div>
                    <span className="tnum text-muted">{formatMoney(driver.pay_value)}/day</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              {dict.admin.addDriver}
            </h2>
            <AddDriverForm vehicles={vehicleList} dict={dict} />
          </Card>
        </div>
      </div>
    </div>
  );
}
