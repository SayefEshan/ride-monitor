import Link from "next/link";

import { BrandMark } from "@/components/brand";
import { LocaleToggle } from "@/components/locale-toggle";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDictionary } from "@/lib/i18n";
import { getLocale, getTheme } from "@/lib/supabase/server";

import { LoginForm } from "./login-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const locale = await getLocale();
  const theme = await getTheme();
  const dict = getDictionary(locale);
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <main className="flex flex-1 flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm space-y-8">
        <header className="flex flex-col items-center gap-3 text-center">
          <BrandMark size="lg" />
          <div>
            <h1 className="text-2xl font-semibold text-body">{dict.common.appName}</h1>
            <p className="mt-1 text-sm text-muted">{dict.auth.tagline}</p>
          </div>
        </header>

        <LoginForm dict={dict} next={next} />

        <p className="text-center text-sm text-muted">
          <Link href="/onboarding" className="font-medium text-body underline">
            {dict.auth.noAccount}
          </Link>
        </p>

        <div className="flex items-center justify-center gap-2">
          <LocaleToggle current={locale} />
          <ThemeToggle
            current={theme}
            labels={{ toDark: dict.common.switchToDark, toLight: dict.common.switchToLight }}
          />
        </div>
      </div>
    </main>
  );
}
