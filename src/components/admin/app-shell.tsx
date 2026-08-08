"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { BrandMark } from "@/components/brand";
import { cn } from "@/lib/cn";

export type NavItem = { href: string; label: string; icon: ReactNode };

/**
 * Admin chrome.
 *
 * Six destinations is too many for a bottom bar and far too many for the
 * icon strip this replaced, where labels were hidden below `sm` and the icons
 * simply crushed together. On phones the nav becomes a drawer with full
 * labels; from `lg` up it is a permanent sidebar and the drawer never exists.
 */
export function AppShell({
  orgName,
  userName,
  nav,
  labels,
  signOut,
  themeToggle,
  children,
}: {
  orgName: string;
  userName: string;
  nav: NavItem[];
  labels: { nav: string; openMenu: string; closeMenu: string };
  signOut: ReactNode;
  themeToggle: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // A drawer that covers the page should still close on Escape, and the page
  // beneath it should not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const currentLabel = nav.find((item) => isActive(item.href))?.label ?? orgName;

  const navList = (
    <ul className="space-y-1">
      {nav.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            // Tapping a destination is the moment the drawer has done its job.
            // Doing this here rather than reacting to a pathname change keeps
            // it an event, which is both simpler and what React now expects.
            onClick={() => setOpen(false)}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={cn(
              "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition",
              isActive(item.href)
                ? "bg-brand-soft text-body"
                : "text-muted hover:bg-sunken hover:text-body",
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-lg transition",
                isActive(item.href) ? "bg-brand text-white" : "bg-sunken text-muted",
              )}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      {/* Phone and tablet: a slim bar that names where you are. */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-hairline bg-raised/95 px-3 py-2.5 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={labels.openMenu}
          aria-expanded={open}
          className="grid size-11 shrink-0 place-items-center rounded-xl text-body hover:bg-sunken"
        >
          <Menu aria-hidden className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold text-body">{currentLabel}</span>
        <BrandMark size="sm" />
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label={labels.closeMenu}
            onClick={() => setOpen(false)}
            className="animate-scrim absolute inset-0 bg-ink-950/50 backdrop-blur-[2px]"
          />
          <div className="animate-drawer absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] flex-col border-r border-hairline bg-raised">
            <div className="flex items-start justify-between gap-2 p-4">
              <div className="min-w-0">
                <p className="truncate font-semibold text-body">{orgName}</p>
                <p className="truncate text-xs text-muted">{userName}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={labels.closeMenu}
                className="grid size-10 shrink-0 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-body"
              >
                <X aria-hidden className="size-5" />
              </button>
            </div>

            <nav aria-label={labels.nav} className="flex-1 overflow-y-auto px-3 pb-4">
              {navList}
            </nav>

            <div className="flex items-center gap-2 border-t border-hairline p-3">
              <div className="min-w-0 flex-1">{signOut}</div>
              {themeToggle}
            </div>
          </div>
        </div>
      )}

      {/* Desktop: always-present sidebar, no drawer machinery involved. */}
      <aside className="hidden w-64 shrink-0 border-r border-hairline bg-raised lg:flex lg:flex-col">
        <div className="p-4">
          <BrandMark size="sm" className="mb-3" />
          <p className="truncate font-semibold text-body">{orgName}</p>
          <p className="truncate text-xs text-muted">{userName}</p>
        </div>

        <nav aria-label={labels.nav} className="flex-1 px-3">
          {navList}
        </nav>

        <div className="flex items-center gap-2 border-t border-hairline p-3">
          <div className="min-w-0 flex-1">{signOut}</div>
          {themeToggle}
        </div>
      </aside>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        {children}
      </main>
    </div>
  );
}
