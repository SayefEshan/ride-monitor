-- 0002 added composite (id, org_id) foreign keys without removing the
-- single-column ones they subsume, leaving two relationship paths between the
-- same pair of tables. PostgREST refuses to guess which one an embedded
-- select means (PGRST201), so every `select ... expense_categories(name)`
-- style query in the app started failing.
--
-- The composite is a strict superset: `(log_id, org_id) -> (id, org_id)` can
-- only match a row whose id is log_id, so it already guarantees what the
-- single-column key guaranteed, and each one was created with the same
-- ON DELETE rule. Dropping the redundant keys restores one unambiguous
-- relationship per pair without weakening integrity.
--
-- daily_logs -> profiles keeps two keys (driver_id and submitted_by), but
-- those are genuinely different relationships and predate this schema.

alter table daily_logs          drop constraint daily_logs_vehicle_id_fkey;
alter table log_earnings        drop constraint log_earnings_log_id_fkey;
alter table log_earnings        drop constraint log_earnings_platform_id_fkey;
alter table expenses            drop constraint expenses_log_id_fkey;
alter table expenses            drop constraint expenses_vehicle_id_fkey;
alter table expenses            drop constraint expenses_category_id_fkey;
alter table vehicle_assignments drop constraint vehicle_assignments_vehicle_id_fkey;
alter table vehicle_assignments drop constraint vehicle_assignments_driver_id_fkey;
alter table rentals             drop constraint rentals_vehicle_id_fkey;
alter table maintenance         drop constraint maintenance_vehicle_id_fkey;
alter table driver_payments     drop constraint driver_payments_driver_id_fkey;
