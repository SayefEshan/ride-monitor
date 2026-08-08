"use client";

import { useActionState } from "react";

import { ErrorNote, Field, MoneyInput, SubmitButton, TextInput } from "@/components/ui";
import { t, type Dictionary } from "@/lib/i18n";
import type { Vehicle } from "@/lib/types";

import { addDriver, addVehicle, type ActionState } from "./actions";

function Result({ error, success }: { error?: string; success?: string }) {
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (success) {
    return (
      <p role="status" className="rounded-xl bg-income-soft px-4 py-3 text-sm font-medium text-income-deep">
        {success}
      </p>
    );
  }
  return null;
}

export function AddVehicleForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addVehicle, {});

  return (
    <form action={formAction} className="space-y-4">
      <Result
        error={
          state.error
            ? state.error === "invalid"
              ? dict.admin.vehicleInvalid
              : dict.admin.vehicleSaveFailed
            : undefined
        }
        success={state.success ? dict.admin.vehicleAdded : undefined}
      />
      <Field label={dict.onboarding.vehicleName} htmlFor="v-name">
        <TextInput id="v-name" name="name" required placeholder="Toyota Axio" />
      </Field>
      <Field label={dict.onboarding.plateNo} hint={dict.common.optionalHint} htmlFor="v-plate">
        <TextInput id="v-plate" name="plateNo" />
      </Field>
      <Field label={dict.onboarding.fuelType} htmlFor="v-fuel">
        <select
          id="v-fuel"
          name="fuelType"
          defaultValue="LPG"
          className="min-h-12 w-full rounded-xl border border-hairline bg-raised px-4 text-base text-body"
        >
          <option>LPG</option>
          <option>Octane</option>
          <option>Petrol</option>
          <option>Diesel</option>
          <option>CNG</option>
        </select>
      </Field>
      <SubmitButton pendingLabel={dict.admin.adding}>{dict.admin.addVehicle}</SubmitButton>
    </form>
  );
}

export function AddDriverForm({ vehicles, dict }: { vehicles: Vehicle[]; dict: Dictionary }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addDriver, {});

  const errors: Record<string, string> = {
    invalid: dict.admin.driverInvalid,
    phone: dict.admin.driverPhoneInvalid,
    exists: dict.admin.driverExists,
    createLogin: dict.admin.driverLoginFailed,
    profile: dict.admin.driverProfileFailed,
  };

  return (
    <form action={formAction} className="space-y-4">
      <Result
        error={state.error ? (errors[state.error] ?? dict.admin.driverInvalid) : undefined}
        success={
          state.success
            ? t(
                state.success === "assignWarn"
                  ? dict.admin.driverAddedAssignWarn
                  : dict.admin.driverAdded,
                { phone: state.phone ?? "" },
              )
            : undefined
        }
      />
      <Field label={dict.admin.driverName} htmlFor="d-name">
        <TextInput id="d-name" name="fullName" required />
      </Field>
      <Field label={dict.admin.driverPhone} hint={dict.admin.driverPhoneHint} htmlFor="d-phone">
        <TextInput id="d-phone" name="phone" required inputMode="tel" placeholder="01712345678" />
      </Field>
      <Field label={dict.auth.password} hint={dict.admin.driverPasswordHint} htmlFor="d-pass">
        <TextInput id="d-pass" name="password" required minLength={6} autoComplete="new-password" />
      </Field>
      <Field label={dict.admin.payPerDay} hint={dict.admin.payPerDayHint} htmlFor="d-pay">
        <MoneyInput id="d-pay" name="payValue" defaultValue={300} />
      </Field>
      {vehicles.length > 0 && (
        <Field label={dict.admin.assignVehicle} htmlFor="d-vehicle">
          <select
            id="d-vehicle"
            name="vehicleId"
            defaultValue={vehicles[0]?.id}
            className="min-h-12 w-full rounded-xl border border-hairline bg-raised px-4 text-base text-body"
          >
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <SubmitButton pendingLabel={dict.admin.adding}>{dict.admin.addDriver}</SubmitButton>
    </form>
  );
}
