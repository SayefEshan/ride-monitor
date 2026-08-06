"use client";

import { useActionState } from "react";
import Link from "next/link";

import { BrandLock } from "@/components/brand";
import { Card, ErrorNote, Field, SubmitButton, TextInput } from "@/components/ui";

import { createBusiness, type OnboardingState } from "./actions";

export default function OnboardingPage() {
  const [state, formAction] = useActionState<OnboardingState, FormData>(createBusiness, {});

  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-5">
          <BrandLock size="md" tagline="Every taka your car earns, in one place." />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-body">Set up your business</h1>
            <p className="text-sm text-muted">
              Two minutes now, and the dashboard works from day one.
            </p>
          </div>
        </header>

        <form action={formAction} className="space-y-6">
          {state.error && <ErrorNote>{state.error}</ErrorNote>}

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Your account
            </h2>
            <Field label="Your name" htmlFor="ownerName">
              <TextInput id="ownerName" name="ownerName" required autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="email">
              <TextInput
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoCapitalize="none"
              />
            </Field>
            <Field label="Password" hint="At least 8 characters." htmlFor="password">
              <TextInput
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </Field>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Your business
            </h2>
            <Field label="Business name" htmlFor="businessName">
              <TextInput id="businessName" name="businessName" required />
            </Field>
          </Card>

          <Card className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Your first vehicle
            </h2>
            <Field
              label="Vehicle name"
              hint="Something you'll recognise, e.g. “Toyota Axio”."
              htmlFor="vehicleName"
            >
              <TextInput id="vehicleName" name="vehicleName" required />
            </Field>
            <Field label="Plate number" hint="Optional." htmlFor="plateNo">
              <TextInput id="plateNo" name="plateNo" placeholder="DHAKA METRO GA 11-2233" />
            </Field>
            <Field label="Fuel type" htmlFor="fuelType">
              <select
                id="fuelType"
                name="fuelType"
                defaultValue="LPG"
                className="min-h-12 w-full rounded-xl border border-hairline bg-raised px-4 text-base text-body"
              >
                <option value="LPG">LPG</option>
                <option value="Octane">Octane</option>
                <option value="Petrol">Petrol</option>
                <option value="Diesel">Diesel</option>
                <option value="CNG">CNG</option>
              </select>
            </Field>
            <p className="text-xs text-muted">
              You can add more vehicles at any time from Settings.
            </p>
          </Card>

          <SubmitButton full pendingLabel="Creating…">
            Create business
          </SubmitButton>
        </form>

        <p className="text-center text-sm text-muted">
          Already set up?{" "}
          <Link href="/login" className="font-medium text-body underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
