import { CalendarRange, Gauge, Receipt, Settings, UsersRound, Wallet } from "lucide-react";

import { signOut } from "@/app/auth-actions";
import { AppShell } from "@/components/admin/app-shell";
import { ThemeToggle } from "@/components/theme-toggle";
import { getDictionary } from "@/lib/i18n";
import { getLocale, getTheme, requireOwner } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: LayoutProps<"/">) {
  const session = await requireOwner();
  const locale = await getLocale();
  const theme = await getTheme();
  const dict = getDictionary(locale);

  const nav = [
    { href: "/dashboard", label: dict.admin.dashboard, icon: <Gauge className="size-4" /> },
    { href: "/logs", label: dict.admin.logs, icon: <CalendarRange className="size-4" /> },
    { href: "/expenses", label: dict.admin.expenses, icon: <Receipt className="size-4" /> },
    { href: "/drivers", label: dict.admin.drivers, icon: <UsersRound className="size-4" /> },
    { href: "/reports", label: dict.admin.reports, icon: <Wallet className="size-4" /> },
    { href: "/settings", label: dict.admin.settings, icon: <Settings className="size-4" /> },
  ];

  return (
    <AppShell
      orgName={session.org.name}
      userName={session.profile.full_name}
      nav={nav}
      signOut={
        <form action={signOut}>
          <button
            type="submit"
            className="min-h-11 w-full rounded-xl px-3 text-left text-sm font-medium text-muted transition hover:bg-sunken hover:text-body"
          >
            {dict.common.signOut}
          </button>
        </form>
      }
      themeToggle={
        <ThemeToggle
          current={theme}
          labels={{ toDark: dict.common.switchToDark, toLight: dict.common.switchToLight }}
        />
      }
    >
      {children}
    </AppShell>
  );
}
