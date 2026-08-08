-- Ride-Monitor initial schema
-- Multi-tenant from day one: every business row carries org_id and is protected by RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('owner', 'driver');
create type log_status as enum ('worked', 'off', 'repair');
create type pay_model as enum ('fixed_daily', 'commission_pct', 'none');
create type rental_type as enum ('private', 'daily', 'corporate');
create type rental_status as enum ('booked', 'ongoing', 'completed', 'cancelled');
create type doc_owner_type as enum ('vehicle', 'driver');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  currency    text not null default 'BDT',
  timezone    text not null default 'Asia/Dhaka',
  created_at  timestamptz not null default now()
);

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  org_id      uuid not null references organizations (id) on delete cascade,
  role        user_role not null default 'driver',
  full_name   text not null,
  phone       text,
  locale      text not null default 'bn',
  -- Driver pay terms. Snapshotted onto each daily log so rate changes never rewrite history.
  pay_model   pay_model not null default 'fixed_daily',
  pay_value   numeric(12, 2) not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index on profiles (org_id);

-- ---------------------------------------------------------------------------
-- RLS helpers.
-- SECURITY DEFINER so policies on `profiles` can read `profiles` without recursion.
-- ---------------------------------------------------------------------------
create or replace function auth_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid()
$$;

create or replace function auth_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()) = 'owner', false)
$$;

-- ---------------------------------------------------------------------------
-- Vehicles & platforms
-- ---------------------------------------------------------------------------
create table vehicles (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations (id) on delete cascade,
  name            text not null,
  plate_no        text,
  fuel_type       text not null default 'LPG',
  odometer_start  numeric(12, 1) not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);
create index on vehicles (org_id);

-- Which driver currently drives which vehicle. A driver logs against their assignment.
create table vehicle_assignments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  vehicle_id  uuid not null references vehicles (id) on delete cascade,
  driver_id   uuid not null references profiles (id) on delete cascade,
  started_on  date not null default current_date,
  ended_on    date,
  created_at  timestamptz not null default now()
);
create index on vehicle_assignments (org_id, driver_id) where ended_on is null;
create index on vehicle_assignments (vehicle_id);

create table platforms (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  name        text not null,
  name_bn     text,
  sort        int not null default 0,
  is_active   boolean not null default true
);
create index on platforms (org_id);

create table expense_categories (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  key         text not null,          -- stable identifier: fuel, parking, toll, repair, wash, fine, other
  name        text not null,
  name_bn     text,
  is_system   boolean not null default false,
  sort        int not null default 0,
  unique (org_id, key)
);

-- ---------------------------------------------------------------------------
-- Daily operations
-- ---------------------------------------------------------------------------
create table daily_logs (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations (id) on delete cascade,
  vehicle_id     uuid not null references vehicles (id) on delete cascade,
  driver_id      uuid references profiles (id) on delete set null,
  log_date       date not null,
  status         log_status not null default 'worked',
  off_reason     text,
  km             numeric(10, 1),
  odometer       numeric(12, 1),
  driver_amount  numeric(12, 2) not null default 0,
  note           text,
  -- Provenance: rows created by the spreadsheet migration are flagged for owner review.
  source         text not null default 'app',   -- app | import
  needs_review   boolean not null default false,
  review_note    text,
  submitted_by   uuid references profiles (id) on delete set null,
  reviewed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One log per vehicle per day. Kills the duplicate submissions seen in the spreadsheet.
  unique (vehicle_id, log_date)
);
create index on daily_logs (org_id, log_date desc);
create index on daily_logs (driver_id, log_date desc);

create table log_earnings (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  log_id       uuid not null references daily_logs (id) on delete cascade,
  platform_id  uuid not null references platforms (id) on delete restrict,
  amount       numeric(12, 2) not null check (amount >= 0),
  trips_count  int check (trips_count >= 0),
  unique (log_id, platform_id)
);
create index on log_earnings (org_id);

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  vehicle_id    uuid not null references vehicles (id) on delete cascade,
  log_id        uuid references daily_logs (id) on delete cascade,
  category_id   uuid not null references expense_categories (id) on delete restrict,
  expense_date  date not null,
  amount        numeric(12, 2) not null check (amount >= 0),
  quantity      numeric(10, 2),        -- litres of fuel, when known
  note          text,
  created_by    uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on expenses (org_id, expense_date desc);
create index on expenses (log_id);

-- ---------------------------------------------------------------------------
-- Rentals: revenue the spreadsheet could not capture at all
-- ---------------------------------------------------------------------------
create table rentals (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations (id) on delete cascade,
  vehicle_id   uuid not null references vehicles (id) on delete cascade,
  type         rental_type not null default 'private',
  client_name  text,
  client_phone text,
  start_at     timestamptz not null,
  end_at       timestamptz,
  amount       numeric(12, 2) not null default 0,
  advance      numeric(12, 2) not null default 0,
  status       rental_status not null default 'booked',
  note         text,
  created_at   timestamptz not null default now()
);
create index on rentals (org_id, start_at desc);

-- ---------------------------------------------------------------------------
-- Driver money: accrual lives on daily_logs, cash payouts live here
-- ---------------------------------------------------------------------------
create table driver_payments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  driver_id   uuid not null references profiles (id) on delete cascade,
  amount      numeric(12, 2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text,
  note        text,
  created_at  timestamptz not null default now()
);
create index on driver_payments (org_id, driver_id, paid_on desc);

-- ---------------------------------------------------------------------------
-- Vehicle life record
-- ---------------------------------------------------------------------------
create table maintenance (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  vehicle_id    uuid not null references vehicles (id) on delete cascade,
  expense_id    uuid references expenses (id) on delete set null,
  service_date  date not null,
  odometer      numeric(12, 1),
  type          text not null,
  cost          numeric(12, 2) not null default 0,
  vendor        text,
  note          text,
  next_due_date date,
  next_due_km   numeric(12, 1),
  created_at    timestamptz not null default now()
);
create index on maintenance (org_id, service_date desc);

create table documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations (id) on delete cascade,
  owner_type  doc_owner_type not null,
  owner_id    uuid not null,
  doc_type    text not null,
  number      text,
  issued_on   date,
  expires_on  date,
  file_path   text,
  created_at  timestamptz not null default now()
);
create index on documents (org_id, expires_on);

create table attachments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  parent_type   text not null,        -- daily_log | expense | log_earning | maintenance
  parent_id     uuid not null,
  storage_path  text not null,
  label         text,
  uploaded_by   uuid references profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index on attachments (org_id, parent_type, parent_id);

-- ---------------------------------------------------------------------------
-- Derived summaries. security_invoker keeps RLS in force for the querying user.
-- ---------------------------------------------------------------------------
create view daily_summary with (security_invoker = true) as
select
  l.id            as log_id,
  l.org_id,
  l.vehicle_id,
  l.driver_id,
  l.log_date,
  l.status,
  l.km,
  l.driver_amount,
  l.needs_review,
  coalesce(e.income, 0)                                    as income,
  coalesce(x.expense, 0)                                   as expense,
  coalesce(x.fuel, 0)                                      as fuel,
  coalesce(e.income, 0) - coalesce(x.expense, 0) - l.driver_amount as net
from daily_logs l
left join lateral (
  select sum(amount) as income from log_earnings where log_id = l.id
) e on true
left join lateral (
  select
    sum(ex.amount)                                              as expense,
    sum(ex.amount) filter (where c.key = 'fuel')                as fuel
  from expenses ex
  join expense_categories c on c.id = ex.category_id
  where ex.log_id = l.id
) x on true;

create view vehicle_lifetime with (security_invoker = true) as
select
  v.id            as vehicle_id,
  v.org_id,
  v.name,
  coalesce(sum(s.km), 0)             as total_km,
  coalesce(sum(s.income), 0)         as total_income,
  coalesce(sum(s.expense), 0)        as total_expense,
  coalesce(sum(s.driver_amount), 0)  as total_driver_pay,
  coalesce(sum(s.net), 0)            as total_net,
  count(*) filter (where s.status = 'worked') as worked_days
from vehicles v
left join daily_summary s on s.vehicle_id = v.id
-- Lifetime P&L is owner-only business intelligence. RLS on the underlying
-- tables would still let a driver see totals derived from their own logs.
where is_owner()
group by v.id, v.org_id, v.name;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table organizations       enable row level security;
alter table profiles            enable row level security;
alter table vehicles            enable row level security;
alter table vehicle_assignments enable row level security;
alter table platforms           enable row level security;
alter table expense_categories  enable row level security;
alter table daily_logs          enable row level security;
alter table log_earnings        enable row level security;
alter table expenses            enable row level security;
alter table rentals             enable row level security;
alter table driver_payments     enable row level security;
alter table maintenance         enable row level security;
alter table documents           enable row level security;
alter table attachments         enable row level security;

-- Organizations: readable by members, mutable by owners only.
create policy org_read   on organizations for select using (id = auth_org_id());
create policy org_update on organizations for update using (id = auth_org_id() and is_owner());

-- Profiles: everyone sees their own row; owners see the whole org and manage it.
create policy profile_self_read on profiles for select using (id = auth.uid());
create policy profile_org_read  on profiles for select using (org_id = auth_org_id() and is_owner());
create policy profile_self_edit on profiles for update using (id = auth.uid())
  with check (id = auth.uid());
create policy profile_owner_all on profiles for all using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

-- Reference data: any member reads, only owners write.
create policy vehicle_read  on vehicles for select using (org_id = auth_org_id());
create policy vehicle_write on vehicles for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

create policy assignment_read  on vehicle_assignments for select using (org_id = auth_org_id());
create policy assignment_write on vehicle_assignments for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

create policy platform_read  on platforms for select using (org_id = auth_org_id());
create policy platform_write on platforms for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

create policy category_read  on expense_categories for select using (org_id = auth_org_id());
create policy category_write on expense_categories for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

-- Daily logs: owners see the org; drivers see and write only their own.
create policy log_owner_all on daily_logs for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());
create policy log_driver_read on daily_logs for select
  using (org_id = auth_org_id() and driver_id = auth.uid());
create policy log_driver_insert on daily_logs for insert
  with check (org_id = auth_org_id() and driver_id = auth.uid());
-- Drivers may correct a log until the owner reviews it.
create policy log_driver_update on daily_logs for update
  using (org_id = auth_org_id() and driver_id = auth.uid() and reviewed_at is null)
  with check (org_id = auth_org_id() and driver_id = auth.uid());

-- Child rows follow their parent log's visibility.
create policy earning_owner_all on log_earnings for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());
create policy earning_driver_rw on log_earnings for all
  using (exists (
    select 1 from daily_logs l
    where l.id = log_earnings.log_id and l.driver_id = auth.uid()
  ))
  with check (exists (
    select 1 from daily_logs l
    where l.id = log_earnings.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
  ));

create policy expense_owner_all on expenses for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());
create policy expense_driver_rw on expenses for all
  using (exists (
    select 1 from daily_logs l
    where l.id = expenses.log_id and l.driver_id = auth.uid()
  ))
  with check (exists (
    select 1 from daily_logs l
    where l.id = expenses.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
  ));

-- Owner-only business data. Drivers must never read these.
create policy rental_owner_all on rentals for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

create policy maintenance_owner_all on maintenance for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());

-- Driver payments: owners manage, drivers read their own ledger.
create policy payment_owner_all on driver_payments for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());
create policy payment_driver_read on driver_payments for select
  using (org_id = auth_org_id() and driver_id = auth.uid());

-- Documents: owners manage all; drivers manage their own personal documents.
create policy document_owner_all on documents for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());
create policy document_driver_rw on documents for all
  using (org_id = auth_org_id() and owner_type = 'driver' and owner_id = auth.uid())
  with check (org_id = auth_org_id() and owner_type = 'driver' and owner_id = auth.uid());

-- Attachments: owners see all; drivers see what hangs off their own logs.
create policy attachment_owner_all on attachments for all
  using (org_id = auth_org_id() and is_owner())
  with check (org_id = auth_org_id() and is_owner());
create policy attachment_driver_rw on attachments for all
  using (org_id = auth_org_id() and uploaded_by = auth.uid())
  with check (org_id = auth_org_id() and uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger daily_logs_touch before update on daily_logs
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Private storage for receipts and documents
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- Paths are `<org_id>/<...>`, so the first path segment scopes the tenant.
create policy receipts_read on storage.objects for select
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth_org_id()::text);
create policy receipts_insert on storage.objects for insert
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth_org_id()::text);
create policy receipts_delete on storage.objects for delete
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth_org_id()::text and is_owner());
