"use client";

import { useActionState } from "react";

import { signIn, type SignInState } from "@/app/auth-actions";
import { ErrorNote, Field, SubmitButton, TextInput } from "@/components/ui";
import type { Dictionary } from "@/lib/i18n";

export function LoginForm({ dict, next }: { dict: Dictionary; next: string }) {
  const [state, formAction] = useActionState<SignInState, FormData>(signIn, {});

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="next" value={next} />

      {state.error && <ErrorNote>{dict.auth.failed}</ErrorNote>}

      <Field label={dict.auth.identifier} hint={dict.auth.identifierHint} htmlFor="identifier">
        <TextInput
          id="identifier"
          name="identifier"
          // `username` lets password managers and Android autofill recognise
          // the pair even though the value may be a phone number.
          autoComplete="username"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="01712345678"
        />
      </Field>

      <Field label={dict.auth.password} htmlFor="password">
        <TextInput
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton full pendingLabel={dict.auth.signingIn}>
        {dict.auth.signIn}
      </SubmitButton>
    </form>
  );
}
