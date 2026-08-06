import { setLocale } from "@/app/auth-actions";
import { cn } from "@/lib/cn";
import { LOCALES, type Locale } from "@/lib/i18n";

const LABELS: Record<Locale, string> = { bn: "বাংলা", en: "English" };

/**
 * Plain form posts, so switching language works before any JavaScript has
 * loaded — which matters on the slow connections drivers often have.
 */
export function LocaleToggle({ current }: { current: Locale }) {
  return (
    <form action={setLocale} className="inline-flex rounded-full border border-hairline p-0.5">
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="submit"
          name="locale"
          value={locale}
          aria-pressed={locale === current}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-medium transition",
            locale === current ? "bg-brand text-white" : "text-muted hover:text-body",
          )}
        >
          {LABELS[locale]}
        </button>
      ))}
    </form>
  );
}
