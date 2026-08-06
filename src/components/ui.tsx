"use client";

import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

// Touch targets are 48px minimum throughout: this is used one-handed, at
// night, by someone who has been driving all day.
const CONTROL = "min-h-12 rounded-xl px-4 text-base";

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white font-semibold shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "bg-raised text-body border border-hairline hover:bg-sunken",
  ghost: "text-muted hover:text-body hover:bg-sunken",
  danger: "bg-expense text-white font-semibold hover:brightness-110",
};

export function Button({
  variant = "primary",
  className,
  full,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; full?: boolean }) {
  return (
    <button
      className={cn(
        CONTROL,
        "inline-flex items-center justify-center gap-2 transition",
        "disabled:cursor-not-allowed disabled:opacity-50",
        BUTTON_VARIANTS[variant],
        full && "w-full",
        className,
      )}
      {...props}
    />
  );
}

/** Submit button that reflects the pending state of its enclosing form. */
export function SubmitButton({
  children,
  pendingLabel,
  ...props
}: ComponentProps<typeof Button> & { pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-card border border-hairline bg-raised p-4 shadow-sm", className)}
      {...props}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>
      {hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form fields
// ---------------------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-body">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-expense">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        CONTROL,
        "w-full border border-hairline bg-raised text-body",
        "placeholder:text-muted/60",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Money never accepts free text. The spreadsheet this product replaces was
 * full of entries like "2880..Taka" and "LPG/1200" that broke every formula
 * downstream, so the keypad is numeric and the value is constrained here.
 */
export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-muted">
        ৳
      </span>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        step="1"
        className={cn(
          CONTROL,
          "tnum w-full border border-hairline bg-raised pl-9 text-lg font-semibold text-body",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function NumberInput({
  className,
  suffix,
  ...props
}: ComponentProps<"input"> & { suffix?: string }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={0}
        className={cn(
          CONTROL,
          "tnum w-full border border-hairline bg-raised text-lg font-semibold text-body",
          suffix && "pr-14",
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          className,
        )}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-muted">
          {suffix}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "gain" | "loss" | "warn";
  children: ReactNode;
}) {
  const tones = {
    neutral: "bg-sunken text-muted",
    gain: "bg-income-soft text-income-deep",
    loss: "bg-expense-soft text-expense-deep",
    warn: "bg-warn-soft text-warn-deep",
  };
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-card border border-dashed border-hairline px-6 py-10 text-center">
      <p className="font-medium text-body">{title}</p>
      {body && <p className="mt-1 text-sm text-muted">{body}</p>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl border-l-4 border-expense bg-expense-soft px-4 py-3 text-sm font-medium text-expense-deep"
    >
      {children}
    </p>
  );
}
