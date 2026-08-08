"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Camera, Check, Loader2, Plus, X } from "lucide-react";

import { Button, Card, ErrorNote, Field, MoneyInput, NumberInput, TextInput } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { Dictionary, Locale } from "@/lib/i18n";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ExpenseCategory, LogStatus, Platform } from "@/lib/types";

import { submitDailyLog, type DailyLogPayload } from "./actions";

export type ExistingLog = {
  status: LogStatus;
  offReason: string | null;
  km: number | null;
  driverAmount: number;
  note: string | null;
  earnings: Record<string, number>;
  expenses: Record<string, number>;
};

type Props = {
  dict: Dictionary;
  locale: Locale;
  orgId: string;
  vehicleId: string;
  logDate: string;
  platforms: Platform[];
  categories: ExpenseCategory[];
  defaultDriverPay: number;
  existing: ExistingLog | null;
  /**
   * Copy overrides for the owner, who files the same form for an arbitrary
   * date. The driver's wording is anchored to "today" and would be wrong
   * there; everything else reads correctly for both.
   */
  headings?: {
    didCarRun?: string;
    submitted?: string;
    editAgain?: string;
    earningsTitle?: string;
    payTitle?: string;
    payAmount?: string;
  };
};

const OFF_REASONS = ["off", "repair", "other"] as const;

export function TodayForm({
  dict,
  locale,
  orgId,
  vehicleId,
  logDate,
  platforms,
  categories,
  defaultDriverPay,
  existing,
  headings,
}: Props) {
  // `null` means the driver has not answered the first question yet, which is
  // different from having answered "no".
  const [status, setStatus] = useState<LogStatus | null>(existing?.status ?? null);
  const [offReason, setOffReason] = useState(existing?.offReason ?? "off");
  const [earnings, setEarnings] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      platforms.map((p) => [p.id, existing?.earnings[p.id] ? String(existing.earnings[p.id]) : ""]),
    ),
  );
  const [expenses, setExpenses] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      categories.map((c) => [
        c.key,
        existing?.expenses[c.key] ? String(existing.expenses[c.key]) : "",
      ]),
    ),
  );
  // Fuel is asked every single day, so it gets its own field rather than
  // hiding behind "add an expense".
  const [extraKeys, setExtraKeys] = useState<string[]>(() =>
    categories
      .filter((c) => c.key !== "fuel" && (existing?.expenses[c.key] ?? 0) > 0)
      .map((c) => c.key),
  );
  const [km, setKm] = useState(existing?.km != null ? String(existing.km) : "");
  const [pay, setPay] = useState(String(existing?.driverAmount ?? defaultDriverPay ?? ""));
  const [note, setNote] = useState(existing?.note ?? "");
  const [photos, setPhotos] = useState<{ path: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const label = (c: ExpenseCategory) => (locale === "bn" && c.name_bn ? c.name_bn : c.name);
  const platformLabel = (p: Platform) => (locale === "bn" && p.name_bn ? p.name_bn : p.name);

  // submitDailyLog returns "invalid" | "vehicle" | "save"; the upload path
  // sets "upload". Each failure reads differently — a validation slip is the
  // driver's to fix, a save failure is not.
  const errorText = (code: string) =>
    code === "invalid"
      ? dict.driver.errInvalid
      : code === "vehicle"
        ? dict.driver.errVehicle
        : code === "upload"
          ? dict.driver.errUpload
          : dict.driver.errSave;

  const num = (value: string) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const totals = useMemo(() => {
    const income = Object.values(earnings).reduce((sum, v) => sum + num(v), 0);
    const spent = Object.values(expenses).reduce((sum, v) => sum + num(v), 0);
    return { income, spent };
  }, [earnings, expenses]);

  const fuelCategory = categories.find((c) => c.key === "fuel");
  const availableExtras = categories.filter((c) => c.key !== "fuel" && !extraKeys.includes(c.key));

  async function uploadPhotos(files: FileList) {
    setUploading(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();

    try {
      for (const file of Array.from(files)) {
        // The first path segment is the org id — storage policies key off it.
        const safeName = file.name.replace(/[^\w.\-]/g, "_");
        const path = `${orgId}/${logDate}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("receipts")
          .upload(path, file, { upsert: false });
        if (uploadError) throw uploadError;
        setPhotos((prev) => [...prev, { path, name: file.name }]);
      }
    } catch {
      setError("upload");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleSubmit() {
    if (!status) return;
    setError(null);

    const payload: DailyLogPayload = {
      logDate,
      vehicleId,
      status: status === "worked" ? "worked" : offReason === "repair" ? "repair" : "off",
      offReason: status === "worked" ? undefined : offReason,
      km: km ? num(km) : null,
      driverAmount: num(pay),
      note: note || undefined,
      earnings: platforms
        .map((p) => ({ platformId: p.id, amount: num(earnings[p.id] ?? "") }))
        .filter((e) => e.amount > 0),
      expenses: Object.entries(expenses)
        .map(([categoryKey, value]) => ({ categoryKey, amount: num(value) }))
        .filter((e) => e.amount > 0),
      attachments: photos.map((p) => ({ path: p.path })),
    };

    startTransition(async () => {
      const result = await submitDailyLog(payload);
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  if (done) {
    return (
      <Card className="space-y-4 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-income-soft">
          <Check aria-hidden className="size-7 text-income-deep" />
        </div>
        <p className="text-lg font-semibold text-body">
          {headings?.submitted ?? dict.driver.submitted}
        </p>
        <Button variant="secondary" full onClick={() => setDone(false)}>
          {headings?.editAgain ?? dict.driver.editExisting}
        </Button>
      </Card>
    );
  }

  // Question one. Answering "no" is a ten-second interaction, which is what
  // turns a missing day into a recorded one.
  if (status === null) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-body">
          {headings?.didCarRun ?? dict.driver.didCarRun}
        </h1>
        <div className="grid gap-3">
          <Button className="min-h-20 text-lg" onClick={() => setStatus("worked")}>
            {dict.driver.yes}
          </Button>
          <Button variant="secondary" className="min-h-20 text-lg" onClick={() => setStatus("off")}>
            {dict.driver.no}
          </Button>
        </div>
      </div>
    );
  }

  if (status !== "worked") {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-semibold text-body">{dict.driver.offReason}</h1>
        <div className="grid gap-2">
          {OFF_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setOffReason(reason)}
              aria-pressed={offReason === reason}
              className={cn(
                "min-h-14 rounded-xl border px-4 text-left text-base transition",
                offReason === reason
                  ? "border-brand bg-brand-soft font-semibold text-body"
                  : "border-hairline bg-raised text-body",
              )}
            >
              {reason === "off"
                ? dict.driver.reasonOff
                : reason === "repair"
                  ? dict.driver.reasonRepair
                  : dict.driver.reasonOther}
            </button>
          ))}
        </div>

        {error && <ErrorNote>{errorText(error)}</ErrorNote>}

        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setStatus(null)}>
            {dict.common.back}
          </Button>
          <Button full onClick={handleSubmit} disabled={pending}>
            {pending ? dict.common.saving : dict.driver.submitReport}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-28">
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold text-body">
            {headings?.earningsTitle ?? dict.driver.earningsTitle}
          </h2>
          <p className="mt-0.5 text-sm text-muted">{dict.driver.earningsHint}</p>
        </div>
        <div className="space-y-3">
          {platforms.map((platform) => (
            <Field key={platform.id} label={platformLabel(platform)} htmlFor={`p-${platform.id}`}>
              <MoneyInput
                id={`p-${platform.id}`}
                value={earnings[platform.id] ?? ""}
                onChange={(e) =>
                  setEarnings((prev) => ({ ...prev, [platform.id]: e.target.value }))
                }
                placeholder="0"
              />
            </Field>
          ))}
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold text-body">{dict.driver.fuelTitle}</h2>
        {fuelCategory && (
          <Field label={dict.driver.fuelAmount} htmlFor="fuel">
            <MoneyInput
              id="fuel"
              value={expenses.fuel ?? ""}
              onChange={(e) => setExpenses((prev) => ({ ...prev, fuel: e.target.value }))}
              placeholder="0"
            />
          </Field>
        )}
        <Field label={dict.driver.kmDriven} htmlFor="km">
          <NumberInput
            id="km"
            suffix="km"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="0"
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold text-body">{dict.driver.expensesTitle}</h2>

        {extraKeys.map((key) => {
          const category = categories.find((c) => c.key === key);
          if (!category) return null;
          return (
            <div key={key} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={label(category)} htmlFor={`x-${key}`}>
                  <MoneyInput
                    id={`x-${key}`}
                    value={expenses[key] ?? ""}
                    onChange={(e) => setExpenses((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder="0"
                  />
                </Field>
              </div>
              <button
                type="button"
                aria-label={`${dict.common.delete} ${label(category)}`}
                onClick={() => {
                  setExtraKeys((prev) => prev.filter((k) => k !== key));
                  setExpenses((prev) => ({ ...prev, [key]: "" }));
                }}
                className="mb-0.5 flex size-12 items-center justify-center rounded-xl border border-hairline text-muted"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          );
        })}

        {availableExtras.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {availableExtras.map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setExtraKeys((prev) => [...prev, category.key])}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-hairline px-3.5 text-sm text-body"
              >
                <Plus aria-hidden className="size-3.5" />
                {label(category)}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold text-body">{headings?.payTitle ?? dict.driver.payTitle}</h2>
        <Field label={headings?.payAmount ?? dict.driver.payAmount} htmlFor="pay">
          <MoneyInput id="pay" value={pay} onChange={(e) => setPay(e.target.value)} placeholder="0" />
        </Field>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-semibold text-body">{dict.common.photo}</h2>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(e) => e.target.files?.length && uploadPhotos(e.target.files)}
        />
        <Button
          variant="secondary"
          full
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 aria-hidden className="size-4 animate-spin" />
          ) : (
            <Camera aria-hidden className="size-4" />
          )}
          {dict.common.addPhoto}
        </Button>
        {photos.length > 0 && (
          <ul className="space-y-1 text-sm text-muted">
            {photos.map((photo) => (
              <li key={photo.path} className="flex items-center gap-2">
                <Check aria-hidden className="size-4 text-income-deep" />
                <span className="truncate">{photo.name}</span>
              </li>
            ))}
          </ul>
        )}

        <Field label={`${dict.common.note} (${dict.common.optional})`} htmlFor="note">
          <TextInput id="note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Card>

      {error && <ErrorNote>{errorText(error)}</ErrorNote>}

      {/* The running total sits above the thumb so the driver can sanity-check
          the day before committing to it. */}
      <div className="fixed inset-x-0 bottom-16 z-10 border-t border-hairline bg-raised/95 px-4 pb-3 pt-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">{dict.driver.totalIncome}</p>
            <p className="tnum truncate text-lg font-semibold text-body">
              {formatMoney(totals.income)}
              <span className="ml-2 text-sm font-normal text-muted">
                − {formatMoney(totals.spent + num(pay))}
              </span>
            </p>
          </div>
          <Button onClick={handleSubmit} disabled={pending} className="shrink-0">
            {pending ? dict.common.saving : dict.driver.submitReport}
          </Button>
        </div>
      </div>
    </div>
  );
}
