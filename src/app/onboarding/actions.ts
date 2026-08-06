"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Seeded so the first daily report can be filed without visiting Settings.
// The owner can rename, reorder or add to any of these later.
const SEED_PLATFORMS = [
  { name: "Uber", name_bn: "উবার", sort: 1 },
  { name: "Pathao", name_bn: "পাঠাও", sort: 2 },
  { name: "InDrive", name_bn: "ইনড্রাইভ", sort: 3 },
  { name: "Private rental", name_bn: "প্রাইভেট ভাড়া", sort: 4 },
];

const SEED_CATEGORIES = [
  { key: "fuel", name: "Fuel", name_bn: "জ্বালানি", sort: 1 },
  { key: "parking", name: "Parking", name_bn: "পার্কিং", sort: 2 },
  { key: "toll", name: "Toll", name_bn: "টোল", sort: 3 },
  { key: "wash", name: "Car wash", name_bn: "গাড়ি ধোয়া", sort: 4 },
  { key: "repair", name: "Repair", name_bn: "মেরামত", sort: 5 },
  { key: "fine", name: "Traffic fine", name_bn: "ট্রাফিক জরিমানা", sort: 6 },
  { key: "other", name: "Other", name_bn: "অন্যান্য", sort: 7 },
];

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  ownerName: z.string().min(1).max(120),
  businessName: z.string().min(1).max(120),
  vehicleName: z.string().min(1).max(120),
  plateNo: z.string().max(40).optional(),
  fuelType: z.string().max(40).default("LPG"),
});

export type OnboardingState = { error?: string };

/**
 * Creates the account and the whole tenant in one step, so the owner reaches a
 * working dashboard without a setup checklist.
 *
 * Runs with the service role because none of these rows exist yet — RLS has no
 * organization to authorise against until the first insert lands.
 */
export async function createBusiness(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    ownerName: formData.get("ownerName"),
    businessName: formData.get("businessName"),
    vehicleName: formData.get("vehicleName"),
    plateNo: formData.get("plateNo") || undefined,
    fuelType: formData.get("fuelType") || "LPG",
  });

  if (!parsed.success) return { error: "Please check the form and try again." };
  const input = parsed.data;

  const admin = createSupabaseAdminClient();

  // No mail server is configured, and the owner is standing at the screen.
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    const alreadyExists = authError?.message?.toLowerCase().includes("already");
    return {
      error: alreadyExists
        ? "An account with this email already exists."
        : "Could not create the account.",
    };
  }

  const userId = created.user.id;

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: input.businessName })
    .select("id")
    .single();

  if (orgError || !org) {
    // Leaving an orphaned login behind would block the owner from retrying.
    await admin.auth.admin.deleteUser(userId);
    return { error: "Could not create the business." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: userId,
    org_id: org.id,
    role: "owner",
    full_name: input.ownerName,
    locale: "en",
    pay_model: "none",
    pay_value: 0,
  });

  if (profileError) {
    await admin.from("organizations").delete().eq("id", org.id);
    await admin.auth.admin.deleteUser(userId);
    return { error: "Could not create your profile." };
  }

  await admin.from("vehicles").insert({
    org_id: org.id,
    name: input.vehicleName,
    plate_no: input.plateNo ?? null,
    fuel_type: input.fuelType,
  });

  await admin.from("platforms").insert(SEED_PLATFORMS.map((p) => ({ ...p, org_id: org.id })));
  await admin
    .from("expense_categories")
    .insert(SEED_CATEGORIES.map((c) => ({ ...c, org_id: org.id, is_system: true })));

  const supabase = await createSupabaseServerClient();
  await supabase.auth.signInWithPassword({ email: input.email, password: input.password });

  redirect("/dashboard");
}
