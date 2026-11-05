-- Issue #31: add staff slot creation to an existing v2 schema.
-- Apply after the v2 001/002 sequence or after the equivalent v2 SQL bootstrap.

begin;

do $preflight$
begin
  if to_regclass('public.doctors') is null
    or to_regclass('public.appointment_slots') is null
    or to_regclass('public.staff_members') is null
    or to_regclass('public.clinics') is not null
    or to_regclass('public.rooms') is not null
    or not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'staff_members' and column_name = 'doctor_id'
    )
    or not exists (
      select 1 from pg_constraint
      where conrelid = to_regclass('public.appointment_slots')
        and conname = 'appointment_slots_no_overlap' and contype = 'x'
    ) then
    raise exception 'Staff slot RPC requires the v2 schema and the doctor overlap constraint';
  end if;
end;
$preflight$;

-- p_user_id must come from the staff JWT verified by FastAPI.
create function public.create_staff_slot(
  p_user_id uuid,
  p_doctor_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns table (id uuid, doctor_id uuid, start_at timestamptz, end_at timestamptz, is_published boolean)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  doctor_active boolean;
  checked_at timestamptz;
  conflict_constraint text;
begin
  if p_user_id is null then
    raise exception 'Staff access denied' using errcode = 'PT403';
  end if;
  if p_doctor_id is null or p_start_at is null or p_end_at is null
    or not isfinite(p_start_at) or not isfinite(p_end_at) then
    raise exception 'Invalid slot input' using errcode = 'PT422';
  end if;

  -- Serialize schedule and booking writes for this doctor. Lock doctor before
  -- membership, consistent with booking/status updates. Key share prevents revocation.
  select d.active into doctor_active
  from public.doctors d where d.id = p_doctor_id for update;
  if not found then
    raise exception 'Staff access denied' using errcode = 'PT403';
  end if;
  perform 1 from public.staff_members m
  where m.user_id = p_user_id and m.doctor_id = p_doctor_id for key share;
  if not found then
    raise exception 'Staff access denied' using errcode = 'PT403';
  end if;
  if not doctor_active then
    raise exception 'Doctor is not accepting new slots' using errcode = 'PT409';
  end if;

  checked_at := clock_timestamp();
  if p_start_at <= checked_at or p_start_at > checked_at + interval '720 hours' then
    raise exception 'Slot must start in the next 30 days' using errcode = 'PT422';
  end if;
  if p_end_at < p_start_at + interval '15 minutes'
    or p_end_at > p_start_at + interval '120 minutes' then
    raise exception 'Slot duration must be 15 to 120 minutes' using errcode = 'PT422';
  end if;

  begin
    return query
      insert into public.appointment_slots as s (doctor_id, start_at, end_at, is_published)
      values (p_doctor_id, p_start_at, p_end_at, true)
      returning s.id, s.doctor_id, s.start_at, s.end_at, s.is_published;
  exception when unique_violation or exclusion_violation then
    get stacked diagnostics conflict_constraint = constraint_name;
    if conflict_constraint in ('appointment_slots_doctor_start_key', 'appointment_slots_no_overlap') then
      raise exception 'Slot overlaps existing availability' using errcode = 'PT409';
    end if;
    raise;
  end;
end;
$body$;

revoke all on function public.create_staff_slot(uuid, uuid, timestamptz, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.create_staff_slot(uuid, uuid, timestamptz, timestamptz)
  to service_role;

commit;
