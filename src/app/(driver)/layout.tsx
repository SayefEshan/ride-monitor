import { CalendarDays, CircleUser, House, NotebookPen } from "lucide-react";

import { signOut } from "@/app/auth-actions";
import { DriverTabs } from "@/components/driver-tabs";
import { LocaleToggle } from "@/components/locale-toggle";
import { PwaRegister } from "@/components/pwa-register";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDictionary } from "@/lib/i18n";
import { getLocale, getTheme, requireDriver } from "@/lib/supabase/server";

/**
 * The driver shell is a phone app: a thin header and a thumb-reachable tab bar
 * at the bottom. There is deliberately no navigation to anything financial.
 */
export default async function DriverLayout({ children }: LayoutProps<"/">) {
  const session = await requireDriver();
  const locale = await getLocale();
  const theme = await getTheme();
  const dict = getDictionary(locale);

  const tabs = [
    { href: "/home", label: dict.driver.homeTitle, icon: <House aria-hidden className="size-5" /> },
    {
      href: "/today",
      label: dict.common.today,
      icon: <NotebookPen aria-hidden className="size-5" />,
    },
    {
      href: "/history",
      label: dict.driver.tabReports,
      icon: <CalendarDays aria-hidden className="size-5" />,
    },
    {
      href: "/profile",
      label: dict.driver.tabProfile,
      icon: <CircleUser aria-hidden className="size-5" />,
    },
  ];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PwaRegister />
      <header className="sticky top-0 z-10 border-b border-hairline bg-raised/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <span className="truncate text-sm font-semibold text-body">
            {session.profile.full_name}
          </span>
          <div className="flex items-center gap-2">
            <ThemeToggle
              current={theme}
              labels={{ toDark: dict.common.switchToDark, toLight: dict.common.switchToLight }}
            />
            <LocaleToggle current={locale} />
            <form action={signOut}>
              <button type="submit" className="px-2 py-1.5 text-xs font-medium text-muted">
                {dict.common.signOut}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Bottom padding clears the fixed tab bar plus the home indicator. */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-32 pt-4">{children}</main>

      <DriverTabs tabs={tabs} />
    </div>
  );
}
