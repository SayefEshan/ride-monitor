/**
 * Creates a self-contained demo organization for design and QA work.
 *
 *   npm run seed:demo            # create (prints login details)
 *   npm run seed:demo -- --clean # delete it again
 *
 * Every row belongs to its own org, so RLS keeps it entirely separate from
 * real businesses in the same project. `--clean` removes the organization,
 * and the foreign keys cascade the rest away.
 */

import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

// Next.js reads `.env.local`; plain Node does not, so it is named explicitly.
config({ path: ".env.local" });

const DEMO_EMAIL = "demo-preview@ridemonitor.local";
const DEMO_PASSWORD = "preview-only-4821";
const DEMO_ORG = "Demo — design preview";

// The demo needs a driver as well as an owner, or the Drivers screen and the
// driver app have nothing to show. The phone maps onto the synthetic address
// exactly as `identifierToEmail` does for a real driver.
const DEMO_DRIVER_PHONE = "8801799999999";
const DEMO_DRIVER_EMAIL = `${DEMO_DRIVER_PHONE}@drivers.ridemonitor.app`;
const DEMO_DRIVER_PAY = 300;

const PLATFORMS = [
  { name: "Uber", name_bn: "উবার", sort: 1, share: 0.4 },
  { name: "Pathao", name_bn: "পাঠাও", sort: 2, share: 0.52 },
  { name: "InDrive", name_bn: "ইনড্রাইভ", sort: 3, share: 0.03 },
  { name: "Private rental", name_bn: "প্রাইভেট ভাড়া", sort: 4, share: 0.05 },
];

const CATEGORIES = [
  { key: "fuel", name: "Fuel", name_bn: "জ্বালানি", sort: 1 },
  { key: "parking", name: "Parking", name_bn: "পার্কিং", sort: 2 },
  { key: "toll", name: "Toll", name_bn: "টোল", sort: 3 },
  { key: "wash", name: "Car wash", name_bn: "গাড়ি ধোয়া", sort: 4 },
  { key: "repair", name: "Repair", name_bn: "মেরামত", sort: 5 },
  { key: "fine", name: "Traffic fine", name_bn: "ট্রাফিক জরিমানা", sort: 6 },
  { key: "other", name: "Other", name_bn: "অন্যান্য", sort: 7 },
];

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Deterministic pseudo-randomness: the same seed always yields the same
 * figures, so a screenshot taken today is comparable with one taken tomorrow.
 */
function rng(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

async function clean() {
  const admin = db();

  const { data: orgs } = await admin.from("organizations").select("id").eq("name", DEMO_ORG);
  for (const org of orgs ?? []) {
    await admin.from("organizations").delete().eq("id", org.id);
  }

  const { data: users } = await admin.auth.admin.listUsers();
  for (const email of [DEMO_EMAIL, DEMO_DRIVER_EMAIL]) {
    const user = users?.users.find((u) => u.email === email);
    if (user) await admin.auth.admin.deleteUser(user.id);
  }

  console.log(`Removed ${orgs?.length ?? 0} demo organization(s) and the demo logins.`);
}

async function seed() {
  const admin = db();
  await clean();

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (authError || !created.user) throw new Error(authError?.message ?? "could not create user");

  const { data: org } = await admin
    .from("organizations")
    .insert({ name: DEMO_ORG })
    .select("id")
    .single();
  if (!org) throw new Error("could not create organization");

  await admin.from("profiles").insert({
    id: created.user.id,
    org_id: org.id,
    role: "owner",
    full_name: "Preview Owner",
    locale: "en",
    pay_model: "none",
  });

  const { data: vehicle } = await admin
    .from("vehicles")
    .insert({ org_id: org.id, name: "Toyota Axio", plate_no: "DHAKA GA 11-2233", fuel_type: "LPG" })
    .select("id")
    .single();
  if (!vehicle) throw new Error("could not create vehicle");

  // Drivers never sign themselves up, so the demo creates this login the same
  // way the owner's Settings screen does.
  const { data: createdDriver, error: driverError } = await admin.auth.admin.createUser({
    email: DEMO_DRIVER_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
  });
  if (driverError || !createdDriver.user) {
    throw new Error(driverError?.message ?? "could not create demo driver");
  }
  const driverId = createdDriver.user.id;

  await admin.from("profiles").insert({
    id: driverId,
    org_id: org.id,
    role: "driver",
    full_name: "Demo Driver",
    phone: DEMO_DRIVER_PHONE,
    locale: "bn",
    pay_model: "fixed_daily",
    pay_value: DEMO_DRIVER_PAY,
  });

  await admin.from("vehicle_assignments").insert({
    org_id: org.id,
    vehicle_id: vehicle.id,
    driver_id: driverId,
    started_on: isoDaysAgo(89),
  });

  const { data: platforms } = await admin
    .from("platforms")
    .insert(
      PLATFORMS.map((p) => ({
        org_id: org.id,
        name: p.name,
        name_bn: p.name_bn,
        sort: p.sort,
      })),
    )
    .select("id, name");

  const { data: categories } = await admin
    .from("expense_categories")
    .insert(CATEGORIES.map((c) => ({ ...c, org_id: org.id, is_system: true })))
    .select("id, key");

  const platformId = (name: string) => platforms?.find((p) => p.name === name)?.id;
  const categoryId = (key: string) => categories?.find((c) => c.key === key)?.id ?? "";

  const random = rng(20260804);
  let logs = 0;

  for (let back = 89; back >= 0; back -= 1) {
    const date = isoDaysAgo(back);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

    // Roughly one rest day a week, and Fridays run light — the shape the
    // weekday chart is meant to reveal.
    const resting = random() < (weekday === 5 ? 0.45 : 0.12);
    if (resting) {
      await admin.from("daily_logs").insert({
        org_id: org.id,
        vehicle_id: vehicle.id,
        driver_id: driverId,
        log_date: date,
        status: random() < 0.2 ? "repair" : "off",
        off_reason: "Rest day",
      });
      logs += 1;
      continue;
    }

    const km = Math.round(85 + random() * 90);
    const income = Math.round(km * (24 + random() * 14));
    const fuel = Math.round(km * (9.5 + random() * 3.5));

    const { data: log } = await admin
      .from("daily_logs")
      .insert({
        org_id: org.id,
        vehicle_id: vehicle.id,
        driver_id: driverId,
        log_date: date,
        status: "worked",
        km,
        driver_amount: DEMO_DRIVER_PAY,
      })
      .select("id")
      .single();
    if (!log) continue;
    logs += 1;

    const earnings = PLATFORMS.map((p) => ({
      org_id: org.id,
      log_id: log.id,
      platform_id: platformId(p.name) ?? "",
      amount: Math.round(income * p.share * (0.6 + random() * 0.8)),
    })).filter((e) => e.amount > 0 && e.platform_id);
    if (earnings.length) await admin.from("log_earnings").insert(earnings);

    const expenses = [{ category_id: categoryId("fuel"), amount: fuel }];
    if (random() < 0.35) {
      expenses.push({
        category_id: categoryId("parking"),
        amount: Math.round(40 + random() * 200),
      });
    }
    await admin.from("expenses").insert(
      expenses.map((e) => ({
        ...e,
        org_id: org.id,
        vehicle_id: vehicle.id,
        log_id: log.id,
        expense_date: date,
      })),
    );
  }

  // Two owner-entered costs, to prove they reach the dashboard totals even
  // though no daily report mentions them.
  await admin.from("expenses").insert([
    {
      org_id: org.id,
      vehicle_id: vehicle.id,
      category_id: categoryId("repair"),
      expense_date: isoDaysAgo(12),
      amount: 6800,
      note: "Front brake pads",
    },
    {
      org_id: org.id,
      vehicle_id: vehicle.id,
      category_id: categoryId("fine"),
      expense_date: isoDaysAgo(5),
      amount: 1500,
      note: "Wrong-lane fine",
    },
  ]);

  // Two payouts against the pay accrued above, so the Drivers screen shows a
  // real outstanding balance rather than "everything is owed".
  await admin.from("driver_payments").insert([
    { org_id: org.id, driver_id: driverId, amount: 9000, paid_on: isoDaysAgo(58), method: "cash" },
    { org_id: org.id, driver_id: driverId, amount: 7500, paid_on: isoDaysAgo(27), method: "cash" },
  ]);

  console.log(`Seeded ${logs} days for "${DEMO_ORG}".`);
  console.log(`Owner:  ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  console.log(`Driver: 01799999999 / ${DEMO_PASSWORD}`);
  console.log("Remove it again with: npm run seed:demo -- --clean");
}

const { values } = parseArgs({ options: { clean: { type: "boolean", default: false } } });

(values.clean ? clean() : seed()).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
