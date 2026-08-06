-- RLS verification: the security promise of the product is that a driver can
-- never read the owner's business data, and no org can ever see another org's.
-- Run via supabase/tests/run-tests.sh. Any FAIL raises an exception.

-- `notice`, not `warning`: each passing assertion reports via RAISE NOTICE.
set client_min_messages = notice;

-- ---------------------------------------------------------------------------
-- Test helper
-- ---------------------------------------------------------------------------
create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL: % (expected %, got %)', label, expected, actual;
  end if;
  raise notice 'pass: %', label;
end;
$$;

-- The app_user / app_admin roles and their grants come from
-- db/migrations/0000_platform.sql — the suite impersonates the exact roles
-- production connects as. Superusers would bypass RLS entirely.

-- ---------------------------------------------------------------------------
-- Fixtures: two organizations, so cross-tenant leakage is testable.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'driver-a@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'owner-b@example.test');

insert into organizations (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Org A'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Org B');

insert into profiles (id, org_id, role, full_name, pay_value) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000000', 'owner',  'Owner A', 0),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000000', 'driver', 'Driver A', 300),
  ('33333333-3333-3333-3333-333333333333', 'bbbbbbbb-0000-0000-0000-000000000000', 'owner',  'Owner B', 0);

insert into vehicles (id, org_id, name, plate_no) values
  ('a0000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'Car A', 'DHAKA-A-1111'),
  ('b0000000-0000-0000-0000-00000000000b', 'bbbbbbbb-0000-0000-0000-000000000000', 'Car B', 'DHAKA-B-2222');

insert into platforms (id, org_id, name, sort) values
  ('a1000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'Uber', 1),
  ('a2000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'Pathao', 2);

insert into expense_categories (id, org_id, key, name, is_system) values
  ('ac000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'fuel', 'Fuel', true),
  ('ad000000-0000-0000-0000-00000000000a', 'aaaaaaaa-0000-0000-0000-000000000000', 'parking', 'Parking', true);

-- A worked day for Driver A: 2000 Uber + 1000 Pathao income, 1500 fuel + 200 parking, 300 driver pay.
insert into daily_logs (id, org_id, vehicle_id, driver_id, log_date, status, km, driver_amount) values
  ('d0000000-0000-0000-0000-00000000000d', 'aaaaaaaa-0000-0000-0000-000000000000',
   'a0000000-0000-0000-0000-00000000000a', '22222222-2222-2222-2222-222222222222',
   date '2026-01-15', 'worked', 120, 300);

insert into log_earnings (org_id, log_id, platform_id, amount) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d', 'a1000000-0000-0000-0000-00000000000a', 2000),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d', 'a2000000-0000-0000-0000-00000000000a', 1000);

insert into expenses (org_id, vehicle_id, log_id, category_id, expense_date, amount) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d',
   'ac000000-0000-0000-0000-00000000000a', date '2026-01-15', 1500),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d',
   'ad000000-0000-0000-0000-00000000000a', date '2026-01-15', 200);

-- Owner-only data the driver must never see.
insert into rentals (org_id, vehicle_id, type, client_name, start_at, amount) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'corporate', 'Acme Ltd', now(), 8000);

insert into maintenance (org_id, vehicle_id, service_date, type, cost) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', date '2026-01-10', 'Oil change', 4500);

-- ---------------------------------------------------------------------------
-- Derived-value correctness (the owner must never calculate by hand)
-- ---------------------------------------------------------------------------
do $$
declare s record;
begin
  select * into s from daily_summary where log_id = 'd0000000-0000-0000-0000-00000000000d';
  perform assert_eq(s.income::numeric,  3000::numeric, 'daily_summary income = 2000 + 1000');
  perform assert_eq(s.expense::numeric, 1700::numeric, 'daily_summary expense = 1500 + 200');
  perform assert_eq(s.fuel::numeric,    1500::numeric, 'daily_summary isolates fuel');
  perform assert_eq(s.net::numeric,     1000::numeric, 'daily_summary net = 3000 - 1700 - 300');
end;
$$;

-- ---------------------------------------------------------------------------
-- Driver A's view of the world
-- ---------------------------------------------------------------------------
set role app_user;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  perform assert_eq((select count(*) from daily_logs)::int,      1, 'driver sees own daily log');
  perform assert_eq((select count(*) from log_earnings)::int,    2, 'driver sees own earnings');
  perform assert_eq((select count(*) from expenses)::int,        2, 'driver sees own log expenses');

  -- The core confidentiality promise.
  perform assert_eq((select count(*) from rentals)::int,     0, 'driver CANNOT read rentals');
  perform assert_eq((select count(*) from maintenance)::int, 0, 'driver CANNOT read maintenance');
  perform assert_eq((select count(*) from vehicle_lifetime)::int, 0, 'driver CANNOT read lifetime P&L');

  -- Drivers see only themselves in the roster, never the owner or their pay terms.
  perform assert_eq((select count(*) from profiles)::int, 1, 'driver sees only own profile');
  perform assert_eq((select count(*) from organizations)::int, 1, 'driver sees own org record only');
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner B must not see a single row belonging to Org A
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';

do $$
begin
  perform assert_eq((select count(*) from daily_logs)::int,   0, 'cross-tenant: no foreign daily logs');
  perform assert_eq((select count(*) from log_earnings)::int, 0, 'cross-tenant: no foreign earnings');
  perform assert_eq((select count(*) from expenses)::int,     0, 'cross-tenant: no foreign expenses');
  perform assert_eq((select count(*) from rentals)::int,      0, 'cross-tenant: no foreign rentals');
  perform assert_eq((select count(*) from vehicles)::int,     1, 'cross-tenant: only own vehicle');
  perform assert_eq((select count(*) from daily_summary)::int, 0, 'cross-tenant: summary view respects RLS');
end;
$$;

-- ---------------------------------------------------------------------------
-- Owner A sees the full business
-- ---------------------------------------------------------------------------
set request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare v record;
begin
  perform assert_eq((select count(*) from daily_logs)::int,  1, 'owner sees org daily logs');
  perform assert_eq((select count(*) from rentals)::int,     1, 'owner sees rentals');
  perform assert_eq((select count(*) from maintenance)::int, 1, 'owner sees maintenance');
  perform assert_eq((select count(*) from profiles)::int,    2, 'owner sees full roster');

  select * into v from vehicle_lifetime where vehicle_id = 'a0000000-0000-0000-0000-00000000000a';
  perform assert_eq(v.total_income::numeric, 3000::numeric, 'lifetime income rolls up');
  perform assert_eq(v.total_net::numeric,    1000::numeric, 'lifetime net rolls up');
  perform assert_eq(v.worked_days::int,      1,             'lifetime counts worked days');
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Structural guarantee: one log per vehicle per day
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    insert into daily_logs (org_id, vehicle_id, driver_id, log_date, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a',
            '22222222-2222-2222-2222-222222222222', date '2026-01-15', 'worked');
    raise exception 'FAIL: duplicate log for the same vehicle/date was accepted';
  exception when unique_violation then
    raise notice 'pass: duplicate vehicle/date submission rejected';
  end;
end;
$$;

-- The same date on a *different* vehicle is legitimate (multi-vehicle support).
insert into daily_logs (org_id, vehicle_id, log_date, status)
values ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', date '2026-01-15', 'worked');

do $$
begin
  raise notice 'pass: same date accepted on a second vehicle';
end;
$$;

-- ---------------------------------------------------------------------------
-- Credentials are invisible to the request path: app_user has no grant on
-- auth.users, so even injected SQL cannot reach password hashes.
-- ---------------------------------------------------------------------------
set role app_user;
do $$
begin
  begin
    perform count(*) from auth.users;
    raise exception 'FAIL: app_user can read auth.users';
  exception when insufficient_privilege then
    raise notice 'pass: app_user cannot read auth.users';
  end;
end;
$$;
reset role;

-- ---------------------------------------------------------------------------
-- app_admin is the service-role replacement: BYPASSRLS, sees every org with
-- no impersonation claim set at all.
-- ---------------------------------------------------------------------------
set role app_admin;
set request.jwt.claim.sub = '';
do $$
begin
  perform assert_eq((select count(*) from daily_logs)::int, 2, 'app_admin bypasses RLS across orgs');
  perform assert_eq((select count(*) from auth.users)::int, 3, 'app_admin can administer auth.users');
end;
$$;
reset role;

do $$
begin
  raise notice 'ALL RLS AND SUMMARY TESTS PASSED';
end;
$$;
