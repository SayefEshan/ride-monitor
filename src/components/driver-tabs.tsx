"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

export type DriverTab = { href: string; label: string; icon: ReactNode };

/**
 * The driver's bottom tab bar.
 *
 * Client-side only so the current tab can be marked — without it every
 * destination looked identical and the app gave no sense of place.
 */
export function DriverTabs({ tabs, ariaLabel }: { tabs: DriverTab[]; ariaLabel: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={ariaLabel}
      className="fixed inset-x-0 bottom-0 z-10 border-t border-hairline bg-raised/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-lg">
        {tabs.map((tab) => {
          const active = isActive(tab.href);

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition",
                  active ? "text-brand" : "text-muted hover:text-body",
                )}
              >
                {tab.icon}
                <span className="truncate px-1">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
