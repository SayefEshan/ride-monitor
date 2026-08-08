import Link from "next/link";

import { BrandLock } from "@/components/brand";
import { getDictionary } from "@/lib/i18n";
import { getLocale } from "@/lib/supabase/server";

import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const locale = await getLocale();
  const dict = getDictionary(locale);

  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-md space-y-6">
        <header className="space-y-5">
          <BrandLock size="md" tagline={dict.auth.tagline} />
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold text-body">{dict.onboarding.title}</h1>
            <p className="text-sm text-muted">{dict.onboarding.subtitle}</p>
          </div>
        </header>

        <OnboardingForm dict={dict} />

        <p className="text-center text-sm text-muted">
          {dict.onboarding.alreadySetUp}{" "}
          <Link href="/login" className="font-medium text-body underline">
            {dict.auth.signIn}
          </Link>
        </p>
      </div>
    </main>
  );
}
