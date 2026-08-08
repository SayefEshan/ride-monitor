"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { identifierToEmail, normalizeBdPhone } from "@/lib/identity";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient, requireOwner } from "@/lib/supabase/server";

// error/success carry language-neutral codes; the form maps them through the
// dictionary. `phone` rides along for the success templates to interpolate.
export type ActionState = { error?: string; success?: string; phone?: string };

const vehicleSchema = z.object({
  name: z.string().min(1).max(120),
  plateNo: z.string().max(40).optional(),
  fuelType: z.string().max(40).default("LPG"),
});

export async function addVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const parsed = vehicleSchema.safeParse({
    name: formData.get("name"),
    plateNo: formData.get("plateNo") || undefined,
    fuelType: formData.get("fuelType") || "LPG",
  });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("vehicles").insert({
    org_id: session.profile.org_id,
    name: parsed.data.name,
    plate_no: parsed.data.plateNo ?? null,
    fuel_type: parsed.data.fuelType,
  });

  if (error) return { error: "vehicleSave" };

  revalidatePath("/settings");
  return { success: "vehicleAdded" };
}

const driverSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(1),
  // Same floor as the owner's password: a driver login moves money records.
  password: z.string().min(8),
  payValue: z.coerce.number().min(0).max(1_000_000).default(0),
  vehicleId: z.string().uuid().optional(),
});

/**
 * Owners create driver logins; drivers never sign themselves up. The driver
 * gets a phone number and a password, and nothing else to remember.
 */
export async function addDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireOwner();
  const parsed = driverSchema.safeParse({
    fullName: formData.get("fullName"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    payValue: formData.get("payValue") || 0,
    vehicleId: formData.get("vehicleId") || undefined,
  });
  if (!parsed.success) return { error: "invalid" };

  const phone = normalizeBdPhone(parsed.data.phone);
  const email = identifierToEmail(parsed.data.phone);
  if (!phone || !email) return { error: "phone" };

  const admin = createSupabaseAdminClient();
  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (authError || !created.user) {
    const exists = authError?.message?.toLowerCase().includes("already");
    return { error: exists ? "exists" : "createLogin" };
  }

  // org_id comes from the caller's own session, never from the form, so an
  // owner cannot attach a driver to somebody else's business.
  const { error: profileError } = await admin.from("profiles").insert({
    id: created.user.id,
    org_id: session.profile.org_id,
    role: "driver",
    full_name: parsed.data.fullName,
    phone,
    locale: "bn",
    pay_model: "fixed_daily",
    pay_value: parsed.data.payValue,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: "profile" };
  }

  if (parsed.data.vehicleId) {
    // Verify the vehicle is this org's before assigning — the service-role
    // client has no RLS to fall back on.
    const { data: vehicle } = await admin
      .from("vehicles")
      .select("id")
      .eq("id", parsed.data.vehicleId)
      .eq("org_id", session.profile.org_id)
      .maybeSingle();

    if (vehicle) {
      const { error: assignmentError } = await admin.from("vehicle_assignments").insert({
        org_id: session.profile.org_id,
        vehicle_id: vehicle.id,
        driver_id: created.user.id,
      });

      // The login exists and works; only the vehicle link failed. Say so —
      // a flat success here would leave the driver unable to file a day with
      // no visible reason.
      if (assignmentError) {
        revalidatePath("/settings");
        return { success: "assignWarn", phone: parsed.data.phone };
      }
    }
  }

  revalidatePath("/settings");
  return { success: "driverAdded", phone: parsed.data.phone };
}
