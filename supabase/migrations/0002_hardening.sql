-- Close the gaps found in the 2026-08 security audit.
--
--  * profiles: RLS restricts rows, not columns, so `profile_self_edit` let a
--    driver set role = 'owner' (or their own pay) on their own row. A trigger
--    now guards the privileged columns.
--  * log_earnings / expenses driver policies never checked the row's own
--    org_id, letting a driver insert rows into another org's ledger; and a
--    `for all` policy applies only USING to DELETE, so the reviewed_at lock
--    never covered deletes. Policies are split per command with both fixed.
--  * Composite (id, org_id) foreign keys so a child row's org can never
--    disagree with its parent's, independent of any future policy mistake.
--  * Money sanity CHECKs that 0001 gave every amount column except these.
--  * vehicle_lifetime now folds in standalone expenses, mirroring
--    withStandalone() — lifetime P&L must shrink when the owner logs a
--    workshop bill with no daily log behind it.

-- ---------------------------------------------------------------------------
-- Profiles: only owners may change role, org, pay terms or active status.
-- Service-role and migration sessions carry no JWT (auth.uid() is null) and
-- stay unrestricted.
-- ---------------------------------------------------------------------------
create or replace function protect_profile_columns()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_owner() and (
    new.role      is distinct from old.role or
    new.org_id    is distinct from old.org_id or
    new.pay_model is distinct from old.pay_model or
    new.pay_value is distinct from old.pay_value or
    new.is_active is distinct from old.is_active
  ) then
    raise exception 'only the owner may change role, org or pay terms'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns before update on profiles
  for each row execute function protect_profile_columns();

-- ---------------------------------------------------------------------------
-- Driver access to log children, split per command: reads stay open for the
-- driver's whole history, writes require the parent log to be unreviewed, and
-- every clause pins the row to the driver's own org.
-- ---------------------------------------------------------------------------
drop policy earning_driver_rw on log_earnings;

create policy earning_driver_read on log_earnings for select
  using (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = log_earnings.log_id and l.driver_id = auth.uid()
    )
  );
create policy earning_driver_insert on log_earnings for insert
  with check (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = log_earnings.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  );
create policy earning_driver_update on log_earnings for update
  using (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = log_earnings.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  )
  with check (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = log_earnings.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  );
create policy earning_driver_delete on log_earnings for delete
  using (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = log_earnings.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  );

drop policy expense_driver_rw on expenses;

create policy expense_driver_read on expenses for select
  using (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = expenses.log_id and l.driver_id = auth.uid()
    )
  );
create policy expense_driver_insert on expenses for insert
  with check (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = expenses.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  );
create policy expense_driver_update on expenses for update
  using (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = expenses.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  )
  with check (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = expenses.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  );
create policy expense_driver_delete on expenses for delete
  using (
    org_id = auth_org_id()
    and exists (
      select 1 from daily_logs l
      where l.id = expenses.log_id and l.driver_id = auth.uid() and l.reviewed_at is null
    )
  );

-- ---------------------------------------------------------------------------
-- Org consistency the database itself enforces: a child row and everything it
-- references must live in the same org.
-- ---------------------------------------------------------------------------
alter table vehicles           add constraint vehicles_id_org_uk           unique (id, org_id);
alter table profiles           add constraint profiles_id_org_uk           unique (id, org_id);
alter table platforms          add constraint platforms_id_org_uk          unique (id, org_id);
alter table expense_categories add constraint expense_categories_id_org_uk unique (id, org_id);
alter table daily_logs         add constraint daily_logs_id_org_uk         unique (id, org_id);

alter table daily_logs add constraint daily_logs_vehicle_org_fk
  foreign key (vehicle_id, org_id) references vehicles (id, org_id) on delete cascade;
-- daily_logs.driver_id keeps its single-column FK only: its on-delete rule is
-- `set null`, which a composite FK would apply to org_id as well.
alter table log_earnings add constraint log_earnings_log_org_fk
  foreign key (log_id, org_id) references daily_logs (id, org_id) on delete cascade;
alter table log_earnings add constraint log_earnings_platform_org_fk
  foreign key (platform_id, org_id) references platforms (id, org_id) on delete restrict;
alter table expenses add constraint expenses_log_org_fk
  foreign key (log_id, org_id) references daily_logs (id, org_id) on delete cascade;
alter table expenses add constraint expenses_vehicle_org_fk
  foreign key (vehicle_id, org_id) references vehicles (id, org_id) on delete cascade;
alter table expenses add constraint expenses_category_org_fk
  foreign key (category_id, org_id) references expense_categories (id, org_id) on delete restrict;
alter table vehicle_assignments add constraint assignments_vehicle_org_fk
  foreign key (vehicle_id, org_id) references vehicles (id, org_id) on delete cascade;
alter table vehicle_assignments add constraint assignments_driver_org_fk
  foreign key (driver_id, org_id) references profiles (id, org_id) on delete cascade;
alter table rentals add constraint rentals_vehicle_org_fk
  foreign key (vehicle_id, org_id) references vehicles (id, org_id) on delete cascade;
alter table maintenance add constraint maintenance_vehicle_org_fk
  foreign key (vehicle_id, org_id) references vehicles (id, org_id) on delete cascade;
alter table driver_payments add constraint driver_payments_driver_org_fk
  foreign key (driver_id, org_id) references profiles (id, org_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Money sanity: 0001 gave every amount column a CHECK except these.
-- ---------------------------------------------------------------------------
alter table daily_logs add constraint daily_logs_driver_amount_nonneg check (driver_amount >= 0);
alter table daily_logs add constraint daily_logs_km_nonneg            check (km >= 0);
alter table daily_logs add constraint daily_logs_odometer_nonneg      check (odometer >= 0);
alter table rentals    add constraint rentals_amount_nonneg           check (amount >= 0);
alter table rentals    add constraint rentals_advance_nonneg          check (advance >= 0);

-- Support the restrict-delete checks and per-vehicle drill-downs.
create index on log_earnings (platform_id);
create index on expenses (vehicle_id);
create index on expenses (category_id);
create index on rentals (vehicle_id);
create index on maintenance (vehicle_id);

-- ---------------------------------------------------------------------------
-- Lifetime P&L must reflect standalone expenses (log_id is null) the same way
-- withStandalone() does everywhere else profit appears.
-- ---------------------------------------------------------------------------
create or replace view vehicle_lifetime with (security_invoker = true) as
select
  v.id            as vehicle_id,
  v.org_id,
  v.name,
  coalesce(d.km, 0)                                as total_km,
  coalesce(d.income, 0)                            as total_income,
  coalesce(d.expense, 0) + coalesce(st.amount, 0)  as total_expense,
  coalesce(d.driver_pay, 0)                        as total_driver_pay,
  coalesce(d.net, 0) - coalesce(st.amount, 0)      as total_net,
  coalesce(d.worked_days, 0)                       as worked_days
from vehicles v
left join lateral (
  select
    sum(s.km)            as km,
    sum(s.income)        as income,
    sum(s.expense)       as expense,
    sum(s.driver_amount) as driver_pay,
    sum(s.net)           as net,
    count(*) filter (where s.status = 'worked') as worked_days
  from daily_summary s
  where s.vehicle_id = v.id
) d on true
left join lateral (
  select sum(x.amount) as amount
  from expenses x
  where x.vehicle_id = v.id and x.log_id is null
) st on true
where is_owner();
