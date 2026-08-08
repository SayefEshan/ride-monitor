"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";

import { formatMoney } from "@/lib/format";

export type WeekdayPoint = { day: string; net: number; days: number };

/**
 * Average profit by weekday.
 *
 * Daily figures are noisy; the pattern underneath them is not. "Sundays barely
 * cover fuel" is a decision the owner can act on — change the shift, or take
 * the day off — which a running total never surfaces.
 */
export function WeekdayChart({ data, averageLabel }: { data: WeekdayPoint[]; averageLabel: string }) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 14, right: 4, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="day"
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--surface-sunken)" }}
            formatter={(value: unknown) => [formatMoney(Number(value ?? 0)), averageLabel]}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              fontSize: 12,
            }}
          />
          {/* No value labels: the tooltip already answers "how much", and
              printing every figure competes with the shape, which is the
              whole point of this chart. */}
          <Bar dataKey="net" radius={[6, 6, 0, 0]}>
            {data.map((point) => (
              // A losing day is a cost, so it takes the warm hue.
              <Cell
                key={point.day}
                fill={point.net >= 0 ? "var(--color-profit)" : "var(--color-expense)"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
