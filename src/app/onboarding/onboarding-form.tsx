"use client";

import { useActionState } from "react";

import { Card, ErrorNote, Field, SubmitButton, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n";

import { createBusiness, type OnboardingState } from "./actions";

export function OnboardingForm({ dict }: { dict: Dictionary }) {
  const [state, formAction] = useActionState<OnboardingState, FormData>(createBusiness, {});

  const errors: Record<string, string> = {
    invalid: dict.onboarding.invalid,
    emailExists: dict.onboarding.emailExists,
    account: dict.onboarding.accountFailed,
    business: dict.onboarding.businessFailed,
    profile: dict.onboarding.profileFailed,
    setup: dict.onboarding.setupFailed,
  };

  return (
    <form action={formAction} className="space-y-6">
      {state.error && <ErrorNote>{errors[state.error] ?? dict.onboarding.invalid}</ErrorNote>}

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.onboarding.accountSection}
        </h2>
        <Field label={dict.onboarding.ownerName} htmlFor="ownerName">
          <TextInput id="ownerName" name="ownerName" required autoComplete="name" />
        </Field>
        <Field label={dict.onboarding.email} htmlFor="email">
          <TextInput
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoCapitalize="none"
          />
        </Field>
        <Field label={dict.auth.password} hint={dict.onboarding.passwordHint} htmlFor="password">
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
          {dict.onboarding.businessSection}
        </h2>
        <Field label={dict.onboarding.businessName} htmlFor="businessName">
          <TextInput id="businessName" name="businessName" required />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          {dict.onboarding.vehicleSection}
        </h2>
        <Field
          label={dict.onboarding.vehicleName}
          hint={dict.onboarding.vehicleNameHint}
          htmlFor="vehicleName"
        >
          <TextInput id="vehicleName" name="vehicleName" required />
        </Field>
        <Field label={dict.onboarding.plateNo} hint={dict.common.optionalHint} htmlFor="plateNo">
          <TextInput id="plateNo" name="plateNo" placeholder="DHAKA METRO GA 11-2233" />
        </Field>
        <Field label={dict.onboarding.fuelType} htmlFor="fuelType">
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
        <p className="text-xs text-muted">{dict.onboarding.moreVehiclesHint}</p>
      </Card>

      <SubmitButton full pendingLabel={dict.onboarding.creating}>
        {dict.onboarding.create}
      </SubmitButton>
    </form>
  );
}
