"use client";

import { useActionState } from "react";

import { ErrorNote, Field, MoneyInput, SubmitButton, TextInput } from "@/components/ui";
import type { Vehicle } from "@/lib/types";

import { addDriver, addVehicle, type ActionState } from "./actions";

function Result({ state }: { state: ActionState }) {
  if (state.error) return <ErrorNote>{state.error}</ErrorNote>;
  if (state.success) {
    return (
      <p role="status" className="rounded-xl bg-income-soft px-4 py-3 text-sm font-medium text-income-deep">
        {state.success}
      </p>
    );
  }
  return null;
}

export function AddVehicleForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(addVehicle, {});

  return (
    <form action={formAction} className="space-y-4">
      <Result state={state} />
      <Field label="Vehicle name" htmlFor="v-name">
        <TextInput id="v-name" name="name" required placeholder="Toyota Axio" />
      </Field>
      <Field label="Plate number" hint="Optional." htmlFor="v-plate">
        <TextInput id="v-plate" name="plateNo" />
      </Field>
      <Field label="Fuel type" htmlFor="v-fuel">
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
      <SubmitButton pendingLabel="Adding…">Add vehicle</SubmitButton>
    </form>
  );
}

export function AddDriverForm({ vehicles }: { vehicles: Vehicle[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(addDriver, {});

  return (
    <form action={formAction} className="space-y-4">
      <Result state={state} />
      <Field label="Driver name" htmlFor="d-name">
        <TextInput id="d-name" name="fullName" required />
      </Field>
      <Field label="Mobile number" hint="This is what the driver types to sign in." htmlFor="d-phone">
        <TextInput id="d-phone" name="phone" required inputMode="tel" placeholder="01712345678" />
      </Field>
      <Field
        label="Password"
        hint="At least 6 characters. Share it with the driver."
        htmlFor="d-pass"
      >
        <TextInput id="d-pass" name="password" required minLength={6} autoComplete="new-password" />
      </Field>
      <Field label="Pay per day" hint="Pre-filled on each daily report." htmlFor="d-pay">
        <MoneyInput id="d-pay" name="payValue" defaultValue={300} />
      </Field>
      {vehicles.length > 0 && (
        <Field label="Assign to vehicle" htmlFor="d-vehicle">
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
      <SubmitButton pendingLabel="Adding…">Add driver</SubmitButton>
    </form>
  );
}
