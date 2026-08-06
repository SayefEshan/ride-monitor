/**
 * One-time migration of the Google Form spreadsheet into Ride Monitor.
 *
 *   npm run import:xlsx -- --file "~/Downloads/Driver tracker.xlsx" --org <uuid> [--apply]
 *
 * Runs as a dry run by default and always writes `import-report.md`, listing
 * every row it cleaned, merged or skipped so the owner can check the judgement
 * calls before anything is committed.
 *
 * The source data is messy in specific, known ways: money columns contain free
 * text ("2880..Taka", "LPG/1200"), some rows cover two days at once
 * ("দুই দিনে.. 688+1810=2498"), spreadsheet formulas leaked "#VALUE!", and two
 * dates were submitted twice. Each is handled explicitly below rather than
 * being silently coerced to zero.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { config } from "dotenv";

// Next.js reads `.env.local`; plain Node does not, so it is named explicitly.
config({ path: ".env.local" });

type RawRow = Record<string, unknown>;

type ParsedRow = {
  sheetRow: number;
  date: string | null;
  uber: number;
  pathao: number;
  indrive: number;
  fuel: number;
  driverPay: number;
  other: number;
  km: number | null;
  notes: string[];
  needsReview: boolean;
};

type Day = Omit<ParsedRow, "date"> & { date: string; mergedFrom: number[] };

const COLUMNS = {
  date: "Date",
  uber: "Uber ",
  pathao: "Pathao",
  indrive: "In-Drive ",
  fuel: "LPG/Octene ",
  driverPay: "Driver Compensation",
  other: "Other expenses ",
  km: "Distance(km)",
} as const;

// ---------------------------------------------------------------------------
// Value cleaning
// ---------------------------------------------------------------------------

/**
 * Pulls a number out of whatever the driver typed.
 *
 * Returns the value plus a note when the cell was not already a clean number,
 * so the report can show exactly what was reinterpreted.
 */
/**
 * True for "3.000" or "1.234.567" — a dot followed by exactly three digits is
 * a thousands separator in this data, not a decimal point. Amounts here are
 * whole taka, so "3.000" is 3000.
 */
function isDottedThousands(token: string): boolean {
  return /^\d{1,3}(\.\d{3})+$/.test(token);
}

function cleanNumber(value: unknown, label: string): { value: number; note?: string } {
  if (value === null || value === undefined || value === "") return { value: 0 };
  if (typeof value === "number") return { value: Number.isFinite(value) ? value : 0 };

  const text = String(value).trim();
  if (!text) return { value: 0 };

  // "00", "000", "1500" — a plain numeric string is not an ambiguity, so it is
  // read silently. Noting these would flag 41 of 46 days and make the review
  // flag worthless.
  if (/^\d+(\.\d+)?$/.test(text) && !isDottedThousands(text)) {
    return { value: Number(text) };
  }

  // Spreadsheet formula errors carry no information at all.
  if (text.startsWith("#")) {
    return { value: 0, note: `${label}: formula error "${text}" treated as 0` };
  }

  // "688+1810=2498" — the driver did the arithmetic; trust the stated total.
  const equals = text.match(/=\s*([\d.,]+)/);
  if (equals) {
    const total = Number(equals[1].replace(/,/g, ""));
    if (Number.isFinite(total)) {
      return { value: total, note: `${label}: read ${total} from "${text}"` };
    }
  }

  // "688+1810" — sum the parts.
  const additions = text.match(/(\d+(?:\.\d+)?(?:\s*\+\s*\d+(?:\.\d+)?)+)/);
  if (additions) {
    const total = additions[1]
      .split("+")
      .map((part) => Number(part.trim()))
      .reduce((sum, part) => sum + (Number.isFinite(part) ? part : 0), 0);
    if (total > 0) return { value: total, note: `${label}: summed "${text}" to ${total}` };
  }

  // "2880..Taka", "LPG/1200", "১০০০ নিছি" — take the first number present.
  // Bengali digits are normalised first so they are not lost.
  const latin = text.replace(/[০-৯]/g, (d) => String("০১২৩৪৫৬৭৮৯".indexOf(d)));
  const firstNumber = latin.match(/(\d+(?:[.,]\d+)*)/);
  if (firstNumber) {
    const token = firstNumber[1];
    // "3.000" and "1,500" are thousands separators here, not decimals — a
    // fuel fill is 1500 taka, never 1.5.
    const parsed = isDottedThousands(token)
      ? Number(token.replace(/[.,]/g, ""))
      : Number(token.replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return { value: parsed, note: `${label}: read ${parsed} from "${text}"` };
    }
  }

  return { value: 0, note: `${label}: could not read "${text}", treated as 0` };
}

/** Excel serial dates and real dates both arrive here; ISO comes out. */
function cleanDate(value: unknown): string | null {
  if (value instanceof Date) return toIso(value);

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  if (typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return toIso(date);
  }

  return null;
}

function toIso(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** A row is a two-day entry when the driver said so in Bangla. */
function isMultiDay(row: RawRow): boolean {
  return Object.values(row).some((value) => typeof value === "string" && value.includes("দুই দিনে"));
}

function parseRow(row: RawRow, sheetRow: number): ParsedRow {
  const notes: string[] = [];
  const take = (column: string, label: string) => {
    const { value, note } = cleanNumber(row[column], label);
    if (note) notes.push(note);
    return value;
  };

  const date = cleanDate(row[COLUMNS.date]);
  if (!date) notes.push("date: unreadable");

  if (isMultiDay(row)) {
    notes.push("entry covers two days; filed against the stated date only");
  }

  const kmRaw = cleanNumber(row[COLUMNS.km], "km");
  if (kmRaw.note) notes.push(kmRaw.note);

  return {
    sheetRow,
    date,
    uber: take(COLUMNS.uber, "Uber"),
    pathao: take(COLUMNS.pathao, "Pathao"),
    indrive: take(COLUMNS.indrive, "InDrive"),
    fuel: take(COLUMNS.fuel, "fuel"),
    driverPay: take(COLUMNS.driverPay, "driver pay"),
    other: take(COLUMNS.other, "other expense"),
    km: kmRaw.value > 0 ? kmRaw.value : null,
    notes,
    needsReview: notes.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      org: { type: "string" },
      vehicle: { type: "string" },
      apply: { type: "boolean", default: false },
      report: { type: "string", default: "import-report.md" },
    },
  });

  if (!values.file) throw new Error("Pass --file <path to the .xlsx>");
  const path = resolve(values.file.replace(/^~/, homedir()));

  // Deliberately NOT `cellDates: true`. That path builds a JS Date from the
  // Excel serial and loses precision — 11 May arrives as 10 May 23:59:40 — so
  // every day landed a date early. Raw serials through SSF.parse_date_code are
  // integer maths, with no Date object and no timezone involved.
  const workbook = XLSX.read(readFileSync(path));
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: null });

  const parsed = raw.map((row, index) => parseRow(row, index + 2));

  // Entirely blank submissions carry nothing worth importing.
  const meaningful = parsed.filter(
    (row) =>
      row.date &&
      (row.uber || row.pathao || row.indrive || row.fuel || row.driverPay || row.other || row.km),
  );

  // The spreadsheet holds two same-date submissions. One log per vehicle per
  // day is the whole point of the new schema, so they are merged and flagged.
  const byDate = new Map<string, ParsedRow[]>();
  for (const row of meaningful) {
    const list = byDate.get(row.date!) ?? [];
    list.push(row);
    byDate.set(row.date!, list);
  }

  const days: Day[] = [...byDate.entries()]
    .map(([date, rows]) => {
      if (rows.length === 1) return { ...rows[0], date, mergedFrom: [] };

      const merged = rows.reduce((acc, row) => ({
        ...acc,
        uber: acc.uber + row.uber,
        pathao: acc.pathao + row.pathao,
        indrive: acc.indrive + row.indrive,
        fuel: acc.fuel + row.fuel,
        driverPay: acc.driverPay + row.driverPay,
        other: acc.other + row.other,
        km: (acc.km ?? 0) + (row.km ?? 0) || null,
        notes: [...acc.notes, ...row.notes],
      }));

      return {
        ...merged,
        date,
        needsReview: true,
        notes: [...merged.notes, `merged ${rows.length} submissions for this date`],
        mergedFrom: rows.map((r) => r.sheetRow),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const totals = days.reduce(
    (acc, day) => ({
      income: acc.income + day.uber + day.pathao + day.indrive,
      expense: acc.expense + day.fuel + day.other,
      driverPay: acc.driverPay + day.driverPay,
      km: acc.km + (day.km ?? 0),
    }),
    { income: 0, expense: 0, driverPay: 0, km: 0 },
  );

  const flagged = days.filter((day) => day.needsReview);
  const skipped = parsed.filter((row) => !meaningful.includes(row));

  writeReport(values.report!, { path, days, totals, flagged, skipped, applied: !!values.apply });

  console.log(`Parsed ${raw.length} rows -> ${days.length} days (${flagged.length} need review).`);
  console.log(
    `Income ${totals.income.toFixed(0)} | expenses ${totals.expense.toFixed(0)} | driver ${totals.driverPay.toFixed(0)} | ${totals.km} km`,
  );
  console.log(`Report written to ${values.report}`);

  if (!values.apply) {
    console.log("\nDry run. Re-run with --apply --org <uuid> to write to the database.");
    return;
  }

  if (!values.org) throw new Error("--apply also needs --org <uuid>");
  await writeToDatabase(values.org, values.vehicle, days);
}

async function writeToDatabase(orgId: string, vehicleArg: string | undefined, days: Day[]) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  const db = createClient(url, key, { auth: { persistSession: false } });

  let vehicleId = vehicleArg;
  if (!vehicleId) {
    const { data } = await db.from("vehicles").select("id").eq("org_id", orgId).limit(2);
    if (data?.length !== 1) {
      throw new Error("Pass --vehicle <uuid>; the organization has more than one vehicle.");
    }
    vehicleId = data[0].id;
  }

  const [{ data: platforms }, { data: categories }] = await Promise.all([
    db.from("platforms").select("id, name").eq("org_id", orgId),
    db.from("expense_categories").select("id, key").eq("org_id", orgId),
  ]);

  const platformId = (name: string) =>
    platforms?.find((p) => p.name.toLowerCase().replace(/[^a-z]/g, "").includes(name))?.id;
  const categoryId = (key: string) => categories?.find((c) => c.key === key)?.id;

  const uberId = platformId("uber");
  const pathaoId = platformId("pathao");
  const indriveId = platformId("indrive");
  const fuelId = categoryId("fuel");
  const otherId = categoryId("other");

  if (!uberId || !pathaoId || !indriveId || !fuelId || !otherId) {
    throw new Error("The organization is missing seeded platforms or expense categories.");
  }

  let written = 0;
  for (const day of days) {
    const { data: log, error } = await db
      .from("daily_logs")
      .upsert(
        {
          org_id: orgId,
          vehicle_id: vehicleId,
          log_date: day.date,
          status: "worked",
          km: day.km,
          driver_amount: day.driverPay,
          source: "import",
          needs_review: day.needsReview,
          review_note: day.notes.join(" · ") || null,
        },
        { onConflict: "vehicle_id,log_date" },
      )
      .select("id")
      .single();

    if (error || !log) {
      console.error(`  ${day.date}: ${error?.message ?? "insert failed"}`);
      continue;
    }

    // Re-running the import must not double the numbers.
    await db.from("log_earnings").delete().eq("log_id", log.id);
    await db.from("expenses").delete().eq("log_id", log.id);

    const earnings = [
      { platform_id: uberId, amount: day.uber },
      { platform_id: pathaoId, amount: day.pathao },
      { platform_id: indriveId, amount: day.indrive },
    ].filter((e) => e.amount > 0);

    if (earnings.length > 0) {
      await db
        .from("log_earnings")
        .insert(earnings.map((e) => ({ ...e, org_id: orgId, log_id: log.id })));
    }

    const expenses = [
      { category_id: fuelId, amount: day.fuel },
      { category_id: otherId, amount: day.other },
    ].filter((e) => e.amount > 0);

    if (expenses.length > 0) {
      await db.from("expenses").insert(
        expenses.map((e) => ({
          ...e,
          org_id: orgId,
          vehicle_id: vehicleId,
          log_id: log.id,
          expense_date: day.date,
        })),
      );
    }

    written += 1;
  }

  console.log(`\nWrote ${written} days into the database.`);
}

function writeReport(
  file: string,
  data: {
    path: string;
    days: Day[];
    totals: { income: number; expense: number; driverPay: number; km: number };
    flagged: Day[];
    skipped: ParsedRow[];
    applied: boolean;
  },
) {
  const money = (value: number) => `৳${Math.round(value).toLocaleString("en-BD")}`;
  const net = data.totals.income - data.totals.expense - data.totals.driverPay;

  const lines = [
    "# Spreadsheet import report",
    "",
    `Source: \`${data.path}\``,
    `Mode: ${data.applied ? "applied to database" : "dry run"}`,
    "",
    "## Totals",
    "",
    `- Days imported: ${data.days.length}`,
    `- Date range: ${data.days[0]?.date ?? "—"} to ${data.days.at(-1)?.date ?? "—"}`,
    `- Income: ${money(data.totals.income)}`,
    `- Expenses: ${money(data.totals.expense)}`,
    `- Driver pay: ${money(data.totals.driverPay)}`,
    `- Net: ${money(net)}`,
    `- Distance: ${Math.round(data.totals.km).toLocaleString("en-BD")} km`,
    "",
    "## Rows needing your review",
    "",
    data.flagged.length === 0
      ? "None — every row parsed cleanly."
      : "These were interpreted rather than read literally. Check them in Daily logs, where they are flagged.",
    "",
  ];

  for (const day of data.flagged) {
    lines.push(`- **${day.date}** — ${day.notes.join("; ")}`);
  }

  if (data.skipped.length > 0) {
    lines.push("", "## Skipped rows", "", "Blank or undated submissions, carrying no data:", "");
    for (const row of data.skipped) {
      lines.push(`- sheet row ${row.sheetRow}${row.date ? ` (${row.date})` : " (no date)"}`);
    }
  }

  writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
