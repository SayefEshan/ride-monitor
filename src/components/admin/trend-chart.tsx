"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatDateShort, formatMoney, formatMoneyShort } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

type Point = { date: string; income: number; expense: number };

/**
 * Income against total outgoings. Two filled areas rather than bars: the shape
 * of the gap between them is the story, and it survives being glanced at.
 */
export function TrendChart({ data, locale }: { data: Point[]; locale: Locale }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="fillIncome" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-income)" stopOpacity={0.28} />
              <stop offset="100%" stopColor="var(--color-income)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-expense)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-expense)" stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value: string) => formatDateShort(value, locale)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value: number) => formatMoneyShort(value)}
            tick={{ fontSize: 11, fill: "var(--text-muted)" }}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            labelFormatter={(value) => formatDateShort(String(value), locale)}
            formatter={(value, name) => [formatMoney(Number(value ?? 0)), name]}
            contentStyle={{
              background: "var(--surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: 12,
              fontSize: 12,
            }}
          />

          <Area
            type="monotone"
            dataKey="income"
            name="Income"
            stroke="var(--color-income)"
            strokeWidth={2}
            fill="url(#fillIncome)"
          />
          <Area
            type="monotone"
            dataKey="expense"
            name="Expenses"
            stroke="var(--color-expense)"
            strokeWidth={2}
            fill="url(#fillExpense)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
