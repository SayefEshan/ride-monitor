"use client";

import { useActionState } from "react";

import { ErrorNote, Field, MoneyInput, SubmitButton, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n";

import { recordPayment, type PaymentState } from "./actions";

export function PaymentForm({
  driverId,
  today,
  suggested,
  dict,
}: {
  driverId: string;
  today: string;
  /** The outstanding balance, pre-filled so settling up is a single tap. */
  suggested: number;
  dict: Dictionary;
}) {
  const [state, formAction] = useActionState<PaymentState, FormData>(recordPayment, {});

  const errors: Record<string, string> = {
    invalid: dict.admin.paymentInvalid,
    driver: dict.admin.paymentUnknownDriver,
    save: dict.admin.paymentSaveFailed,
  };

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="driverId" value={driverId} />

      {state.error && <ErrorNote>{errors[state.error] ?? dict.admin.paymentSaveFailed}</ErrorNote>}
      {state.success && (
        <p role="status" className="rounded-xl bg-income-soft px-4 py-3 text-sm font-medium text-income-deep">
          {dict.admin.paymentRecorded}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={dict.admin.amount} htmlFor={`amount-${driverId}`}>
          <MoneyInput
            // Keyed so the prefill follows the fresh balance after a payment
            // is recorded, instead of freezing at the mount-time figure.
            key={suggested}
            id={`amount-${driverId}`}
            name="amount"
            required
            defaultValue={suggested > 0 ? Math.round(suggested) : ""}
          />
        </Field>
        <Field label={dict.admin.expenseDate} htmlFor={`paid-${driverId}`}>
          <TextInput
            id={`paid-${driverId}`}
            name="paidOn"
            type="date"
            required
            defaultValue={today}
          />
        </Field>
        <Field
          label={`${dict.admin.method} (${dict.common.optional})`}
          htmlFor={`method-${driverId}`}
        >
          <TextInput id={`method-${driverId}`} name="method" placeholder="Cash / bKash" />
        </Field>
      </div>

      <SubmitButton pendingLabel={dict.common.saving}>{dict.admin.recordPayment}</SubmitButton>
    </form>
  );
}
