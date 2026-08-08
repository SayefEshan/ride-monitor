"use client";

import { useActionState } from "react";

import { ErrorNote, Field, MoneyInput, SubmitButton, TextInput } from "@/components/ui";
import type { Dictionary, Locale } from "@/lib/i18n";
import type { ExpenseCategory, Vehicle } from "@/lib/types";

import { addExpense, type ExpenseState } from "./actions";

const SELECT =
  "min-h-12 w-full rounded-xl border border-hairline bg-raised px-4 text-base text-body";

export function ExpenseForm({
  vehicles,
  categories,
  today,
  dict,
  locale,
}: {
  vehicles: Vehicle[];
  categories: ExpenseCategory[];
  today: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const [state, formAction] = useActionState<ExpenseState, FormData>(addExpense, {});
  const label = (c: ExpenseCategory) => (locale === "bn" && c.name_bn ? c.name_bn : c.name);

  const errors: Record<string, string> = {
    invalid: dict.admin.expenseInvalid,
    unknown: dict.admin.expenseUnknown,
    save: dict.admin.expenseSaveFailed,
  };

  return (
    <form action={formAction} className="space-y-4">
      {state.error && <ErrorNote>{errors[state.error] ?? dict.admin.expenseSaveFailed}</ErrorNote>}
      {state.success && (
        <p role="status" className="rounded-xl bg-income-soft px-4 py-3 text-sm font-medium text-income-deep">
          {dict.admin.expenseSaved}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={dict.admin.amount} htmlFor="e-amount">
          <MoneyInput id="e-amount" name="amount" required />
        </Field>
        <Field label={dict.admin.expenseDate} htmlFor="e-date">
          <TextInput id="e-date" name="expenseDate" type="date" required defaultValue={today} />
        </Field>
        <Field label={dict.admin.category} htmlFor="e-category">
          <select id="e-category" name="categoryId" required className={SELECT}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {label(category)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={dict.admin.vehicle} htmlFor="e-vehicle">
          <select id="e-vehicle" name="vehicleId" required className={SELECT}>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label={`${dict.common.note} (${dict.common.optional})`} htmlFor="e-note">
        <TextInput id="e-note" name="note" placeholder="Front brake pads, Karim Motors" />
      </Field>

      <SubmitButton pendingLabel={dict.common.saving}>{dict.admin.addExpense}</SubmitButton>
    </form>
  );
}
