import { Moon, Sun } from "lucide-react";

import { setTheme } from "@/app/auth-actions";
import type { Theme } from "@/lib/theme";

/**
 * One tap flips to the opposite theme. A plain form post, like LocaleToggle,
 * so it works before any JavaScript has loaded.
 */
export function ThemeToggle({
  current,
  labels,
}: {
  current: Theme;
  labels: { toDark: string; toLight: string };
}) {
  const next = current === "dark" ? "light" : "dark";
  const label = next === "dark" ? labels.toDark : labels.toLight;

  return (
    <form action={setTheme}>
      <button
        type="submit"
        name="theme"
        value={next}
        aria-label={label}
        title={label}
        className="grid size-9 shrink-0 place-items-center rounded-full border border-hairline text-muted transition hover:bg-sunken hover:text-body"
      >
        {current === "dark" ? (
          <Sun aria-hidden className="size-4" />
        ) : (
          <Moon aria-hidden className="size-4" />
        )}
      </button>
    </form>
  );
}
