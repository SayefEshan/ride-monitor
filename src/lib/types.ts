// Row shapes mirroring supabase/migrations/0001_init.sql.
// Dates are ISO `YYYY-MM-DD` strings; money is a JS number of BDT.

export type UserRole = "owner" | "driver";
export type LogStatus = "worked" | "off" | "repair";
export type PayModel = "fixed_daily" | "commission_pct" | "none";
export type RentalType = "private" | "daily" | "corporate";
export type DocOwnerType = "vehicle" | "driver";

export type Organization = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

export type Profile = {
  id: string;
  org_id: string;
  role: UserRole;
  full_name: string;
  phone: string | null;
  locale: string;
  pay_model: PayModel;
  pay_value: number;
  is_active: boolean;
};

export type Vehicle = {
  id: string;
  org_id: string;
  name: string;
  plate_no: string | null;
  fuel_type: string;
  odometer_start: number;
  is_active: boolean;
};

export type Platform = {
  id: string;
  org_id: string;
  name: string;
  name_bn: string | null;
  sort: number;
  is_active: boolean;
};

export type ExpenseCategory = {
  id: string;
  org_id: string;
  key: string;
  name: string;
  name_bn: string | null;
  is_system: boolean;
  sort: number;
};

export type DailyLog = {
  id: string;
  org_id: string;
  vehicle_id: string;
  driver_id: string | null;
  log_date: string;
  status: LogStatus;
  off_reason: string | null;
  km: number | null;
  odometer: number | null;
  driver_amount: number;
  note: string | null;
  source: string;
  needs_review: boolean;
  review_note: string | null;
  submitted_by: string | null;
  reviewed_at: string | null;
};

export type LogEarning = {
  id: string;
  org_id: string;
  log_id: string;
  platform_id: string;
  amount: number;
  trips_count: number | null;
};

export type Expense = {
  id: string;
  org_id: string;
  vehicle_id: string;
  log_id: string | null;
  category_id: string;
  expense_date: string;
  amount: number;
  quantity: number | null;
  note: string | null;
};

/** One row of the `daily_summary` view — every figure derived, never entered twice. */
export type DailySummary = {
  log_id: string;
  org_id: string;
  vehicle_id: string;
  driver_id: string | null;
  log_date: string;
  status: LogStatus;
  km: number | null;
  driver_amount: number;
  needs_review: boolean;
  income: number;
  expense: number;
  fuel: number;
  net: number;
};

export type VehicleLifetime = {
  vehicle_id: string;
  org_id: string;
  name: string;
  total_km: number;
  total_income: number;
  total_expense: number;
  total_driver_pay: number;
  total_net: number;
  worked_days: number;
};

/** Signed-in user plus the tenant context every query needs. */
export type SessionContext = {
  userId: string;
  profile: Profile;
  org: Organization;
};
