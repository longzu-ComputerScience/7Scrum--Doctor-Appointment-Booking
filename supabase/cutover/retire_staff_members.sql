-- MANUAL CUTOVER ONLY. Keep outside supabase/migrations so db push never runs it.
-- Back up legacy grants, verify deployed API has switched to Doctor RPCs, then
-- have the Lead approve the cutover. Change approved below only for that run.
begin;

do $preflight$
declare
  approved constant boolean := false;
begin
  if not approved then
    raise exception 'Retirement requires reviewed cutover approval and a backup of legacy grants';
  end if;
  if to_regprocedure('public.create_doctor_slot(uuid,timestamptz,timestamptz)') is null
    or to_regprocedure('public.update_doctor_appointment_status(uuid,uuid,text,text)') is null
    or not exists (select 1 from public.doctor_accounts) then
    raise exception 'Doctor self-service must be installed and an account linked before retiring staff';
  end if;
  lock table public.staff_members in access exclusive mode;
  if exists (select 1 from public.staff_members) then
    raise exception 'Back up and review remaining staff grants before removing them';
  end if;
end;
$preflight$;

drop function if exists public.create_staff_slot(uuid, uuid, timestamptz, timestamptz) restrict;
drop function if exists public.update_appointment_status(uuid, uuid, text, text) restrict;
drop table public.staff_members restrict;

commit;
