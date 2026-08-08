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

-- A non-superuser role, because superusers bypass RLS entirely.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user nologin;
  end if;
end;
$$;
grant usage on schema public, auth, storage to app_user;
grant select, insert, update, delete on all tables in schema public to app_user;
grant select on all tables in schema auth to app_user;
-- Receipt files live in storage.objects, whose policies are part of the same
-- confidentiality promise as the business tables.
grant select, insert, update, delete on all tables in schema storage to app_user;
grant execute on all functions in schema public to app_user;
grant execute on all functions in schema auth to app_user;
grant execute on all functions in schema storage to app_user;

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

-- An owner-entered standalone expense: no daily log behind it, must still
-- reduce lifetime P&L.
insert into expenses (org_id, vehicle_id, category_id, expense_date, amount) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a',
   'ad000000-0000-0000-0000-00000000000a', date '2026-01-20', 500);

-- Owner-only data the driver must never see.
insert into rentals (org_id, vehicle_id, type, client_name, start_at, amount) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'corporate', 'Acme Ltd', now(), 8000);

insert into maintenance (org_id, vehicle_id, service_date, type, cost) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', date '2026-01-10', 'Oil change', 4500);

-- Who drives what. Readable by any member of the org, writable only by owners.
insert into vehicle_assignments (org_id, vehicle_id, driver_id) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a',
   '22222222-2222-2222-2222-222222222222');

-- Cash handed to the driver. They read their own ledger; the owner manages it.
insert into driver_payments (org_id, driver_id, amount, paid_on) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 1200, date '2026-01-16'),
  ('aaaaaaaa-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', 800,  date '2026-01-31'),
  -- Org B's own ledger, so cross-tenant leakage is testable.
  ('bbbbbbbb-0000-0000-0000-000000000000', '33333333-3333-3333-3333-333333333333', 5000, date '2026-01-20');

-- A driver manages their own licence but must not see the car's papers.
insert into documents (org_id, owner_type, owner_id, doc_type) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'driver', '22222222-2222-2222-2222-222222222222', 'Driving licence'),
  ('aaaaaaaa-0000-0000-0000-000000000000', 'vehicle', 'a0000000-0000-0000-0000-00000000000a', 'Fitness certificate'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'vehicle', 'b0000000-0000-0000-0000-00000000000b', 'Insurance');

-- Receipt metadata hanging off the driver's own log.
insert into attachments (org_id, parent_type, parent_id, storage_path, uploaded_by) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'daily_log', 'd0000000-0000-0000-0000-00000000000d',
   'aaaaaaaa-0000-0000-0000-000000000000/2026-01-15/fuel.jpg', '22222222-2222-2222-2222-222222222222'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'daily_log', 'd0000000-0000-0000-0000-00000000000d',
   'bbbbbbbb-0000-0000-0000-000000000000/2026-01-15/fuel.jpg', '33333333-3333-3333-3333-333333333333');

-- The receipt files themselves. The first path segment scopes the tenant.
insert into storage.objects (bucket_id, name) values
  ('receipts', 'aaaaaaaa-0000-0000-0000-000000000000/2026-01-15/fuel.jpg'),
  ('receipts', 'bbbbbbbb-0000-0000-0000-000000000000/2026-01-15/fuel.jpg');

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

  -- Their own ledger, and nobody else's.
  perform assert_eq((select count(*) from driver_payments)::int, 2, 'driver sees own payments');
  perform assert_eq((select sum(amount) from driver_payments)::numeric, 2000::numeric,
                    'driver payment total is their own only');
  perform assert_eq((select count(*) from vehicle_assignments)::int, 1, 'driver sees org assignments');

  -- Personal papers yes; the car's papers are the owner's business.
  perform assert_eq((select count(*) from documents)::int, 1, 'driver sees only own documents');
  perform assert_eq((select count(*) from documents where owner_type = 'vehicle')::int, 0,
                    'driver CANNOT read vehicle documents');

  -- Receipts: their own metadata row, and only their org's files.
  perform assert_eq((select count(*) from attachments)::int, 1, 'driver sees own attachments');
  perform assert_eq((select count(*) from storage.objects)::int, 1, 'driver sees own org receipts only');
end;
$$;

-- ---------------------------------------------------------------------------
-- Forbidden writes: policies must reject these, not merely hide the rows.
-- ---------------------------------------------------------------------------
do $$
begin
  -- Privilege escalation. RLS cannot restrict columns; the trigger must.
  begin
    update profiles set role = 'owner', pay_value = 999999 where id = auth.uid();
    raise exception 'FAIL: driver self-promotion was accepted';
  exception when insufficient_privilege then
    raise notice 'pass: driver cannot change own role or pay';
  end;

  -- The unprivileged columns stay editable.
  update profiles set locale = 'en' where id = auth.uid();
  perform assert_eq(
    (select locale from profiles where id = auth.uid()), 'en'::text,
    'driver can still edit own locale');

  -- Cross-org injection: the row's own org_id must match the caller's org.
  begin
    insert into expenses (org_id, vehicle_id, log_id, category_id, expense_date, amount)
    values ('bbbbbbbb-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a',
            'd0000000-0000-0000-0000-00000000000d', 'ac000000-0000-0000-0000-00000000000a',
            date '2026-01-15', 999999);
    raise exception 'FAIL: cross-org expense insert was accepted';
  exception when insufficient_privilege then
    raise notice 'pass: cross-org expense insert rejected';
  end;

  begin
    insert into log_earnings (org_id, log_id, platform_id, amount)
    values ('bbbbbbbb-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d',
            'a1000000-0000-0000-0000-00000000000a', 999999);
    raise exception 'FAIL: cross-org earning insert was accepted';
  exception when insufficient_privilege then
    raise notice 'pass: cross-org earning insert rejected';
  end;

  -- Owner-only tables: a driver may read nothing and write nothing.
  begin
    insert into driver_payments (org_id, driver_id, amount)
    values ('aaaaaaaa-0000-0000-0000-000000000000', auth.uid(), 5000);
    raise exception 'FAIL: driver recorded their own payment';
  exception when insufficient_privilege then
    raise notice 'pass: driver cannot record a payment to themselves';
  end;

  begin
    insert into vehicle_assignments (org_id, vehicle_id, driver_id)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', auth.uid());
    raise exception 'FAIL: driver assigned themselves a vehicle';
  exception when insufficient_privilege then
    raise notice 'pass: driver cannot assign themselves a vehicle';
  end;

  begin
    insert into rentals (org_id, vehicle_id, start_at, amount)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', now(), 8000);
    raise exception 'FAIL: driver created a rental';
  exception when insufficient_privilege then
    raise notice 'pass: driver cannot create a rental';
  end;

  begin
    insert into maintenance (org_id, vehicle_id, service_date, type)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a',
            date '2026-02-01', 'Oil change');
    raise exception 'FAIL: driver created a maintenance record';
  exception when insufficient_privilege then
    raise notice 'pass: driver cannot create a maintenance record';
  end;

  -- Receipts belong to the org's folder; another tenant's prefix is refused.
  begin
    insert into storage.objects (bucket_id, name)
    values ('receipts', 'bbbbbbbb-0000-0000-0000-000000000000/2026-02-01/forged.jpg');
    raise exception 'FAIL: driver wrote into another org''s receipt folder';
  exception when insufficient_privilege then
    raise notice 'pass: driver cannot write into another org''s receipt folder';
  end;

  -- A foreign org's vehicle cannot anchor this org's day.
  begin
    insert into daily_logs (org_id, vehicle_id, driver_id, log_date, status)
    values ('aaaaaaaa-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b',
            '22222222-2222-2222-2222-222222222222', date '2026-02-01', 'worked');
    raise exception 'FAIL: foreign-org vehicle was accepted on a daily log';
  exception when foreign_key_violation then
    raise notice 'pass: foreign-org vehicle rejected on a daily log';
  end;
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

  -- Org B holds one payment of its own and must see no trace of Org A's.
  perform assert_eq((select count(*) from driver_payments)::int, 1, 'cross-tenant: only own payments');
  perform assert_eq((select count(*) from vehicle_assignments)::int, 0, 'cross-tenant: no foreign assignments');
  perform assert_eq((select count(*) from documents)::int, 1, 'cross-tenant: only own documents');
  perform assert_eq((select count(*) from attachments)::int, 1, 'cross-tenant: only own attachments');
  perform assert_eq((select count(*) from storage.objects)::int, 1, 'cross-tenant: only own receipt files');
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
  perform assert_eq((select count(*) from vehicle_assignments)::int, 1, 'owner sees assignments');
  perform assert_eq((select count(*) from driver_payments)::int, 2, 'owner sees the org payment ledger');
  perform assert_eq((select count(*) from documents)::int,   2, 'owner sees driver and vehicle documents');
  perform assert_eq((select count(*) from attachments)::int, 1, 'owner sees receipt attachments');
  perform assert_eq((select count(*) from storage.objects)::int, 1, 'owner sees own org receipt files');

  select * into v from vehicle_lifetime where vehicle_id = 'a0000000-0000-0000-0000-00000000000a';
  perform assert_eq(v.total_income::numeric,  3000::numeric, 'lifetime income rolls up');
  perform assert_eq(v.total_expense::numeric, 2200::numeric, 'lifetime expense includes standalone costs');
  perform assert_eq(v.total_net::numeric,     500::numeric,  'lifetime net reflects standalone costs');
  perform assert_eq(v.worked_days::int,       1,             'lifetime counts worked days');
end;
$$;

reset role;

-- ---------------------------------------------------------------------------
-- Once the owner reviews a day, the driver may still read it but never
-- rewrite it. Blocked writes are filtered to zero rows, so assert no effect.
-- ---------------------------------------------------------------------------
update daily_logs set reviewed_at = now() where id = 'd0000000-0000-0000-0000-00000000000d';

set role app_user;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
begin
  delete from log_earnings where log_id = 'd0000000-0000-0000-0000-00000000000d';
  delete from expenses     where log_id = 'd0000000-0000-0000-0000-00000000000d';
  update log_earnings set amount = 0 where log_id = 'd0000000-0000-0000-0000-00000000000d';
  update daily_logs   set km = 999   where id     = 'd0000000-0000-0000-0000-00000000000d';

  perform assert_eq((select count(*) from log_earnings)::int, 2, 'reviewed day: earnings survive driver delete');
  perform assert_eq((select count(*) from expenses)::int,     2, 'reviewed day: expenses survive driver delete');
  perform assert_eq((select sum(amount) from log_earnings)::numeric, 3000::numeric, 'reviewed day: earnings survive driver update');
  perform assert_eq((select km from daily_logs where id = 'd0000000-0000-0000-0000-00000000000d')::numeric, 120::numeric, 'reviewed day: log survives driver update');
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
  raise notice 'ALL RLS AND SUMMARY TESTS PASSED';
end;
$$;
