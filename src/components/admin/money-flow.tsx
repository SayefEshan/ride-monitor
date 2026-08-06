import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";

/**
 * The settle-up bar: the whole day's economics as one object.
 *
 * Income is the full width. Fuel and other costs are carved out of it in warm
 * hues, driver pay in slate, and whatever is left glows gold — that remainder
 * is the profit. It is the fare breakdown from a receipt, drawn to scale, so
 * the proportion is legible before any number is read.
 */
export function MoneyFlow({
  income,
  expense,
  driverPay,
  labels,
}: {
  income: number;
  expense: number;
  driverPay: number;
  labels: { income: string; expense: string; driverPay: string; profit: string };
}) {
  const profit = income - expense - driverPay;

  // With no income there is nothing to carve up, and a loss would overflow the
  // bar, so the scale falls back to total outgoings.
  const scale = Math.max(income, expense + driverPay, 1);
  const pct = (value: number) => Math.max((value / scale) * 100, 0);

  const segments = [
    { key: "expense", label: labels.expense, value: expense, className: "bg-expense" },
    { key: "driver", label: labels.driverPay, value: driverPay, className: "bg-ink-400" },
    { key: "profit", label: labels.profit, value: Math.max(profit, 0), className: "bg-profit" },
  ].filter((segment) => segment.value > 0);

  return (
    <div className="space-y-3">
      {/*
        Income is the bar's full width, not a slice of it, so it is stated
        above rather than given a legend swatch that appears nowhere.
      */}
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted">{labels.income}</span>
        <span className="tnum font-semibold text-body">{formatMoney(income)}</span>
      </div>

      <div
        className="flex h-11 w-full overflow-hidden rounded-xl bg-sunken"
        role="img"
        aria-label={`${labels.income} ${formatMoney(income)}, ${labels.expense} ${formatMoney(
          expense,
        )}, ${labels.driverPay} ${formatMoney(driverPay)}, ${labels.profit} ${formatMoney(profit)}`}
      >
        {segments.map((segment, index) => (
          <div
            key={segment.key}
            className={cn("animate-bar h-full", segment.className)}
            style={{ width: `${pct(segment.value)}%`, animationDelay: `${index * 90}ms` }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {[
          { label: labels.expense, value: expense, dot: "bg-expense" },
          { label: labels.driverPay, value: driverPay, dot: "bg-ink-400" },
          { label: labels.profit, value: profit, dot: "bg-profit" },
        ].map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", item.dot)} />
            <span className="text-xs text-muted">{item.label}</span>
            <span className="tnum text-xs font-semibold text-body">{formatMoney(item.value)}</span>
          </li>
        ))}
      </ul>

      {income > 0 && (
        <p className="text-xs text-muted">
          You keep {formatPercent((profit / income) * 100)} of what the car earned.
        </p>
      )}
    </div>
  );
}
