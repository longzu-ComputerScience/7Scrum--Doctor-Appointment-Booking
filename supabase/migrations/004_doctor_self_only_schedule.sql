-- Issue #31: additive migration for doctor self-service on the v2 database.
-- Only link verified doctor accounts. Existing staff grants are not identities.
begin;

do $preflight$
begin
  if to_regclass('auth.users') is null
    or to_regclass('public.doctors') is null
    or to_regclass('public.appointments') is null
    or not exists (
      select 1 from pg_constraint
      where conrelid = to_regclass('public.appointment_slots')
        and conname = 'appointment_slots_no_overlap' and contype = 'x'
    ) then
    raise exception 'Doctor self-service requires the v2 schema and its slot exclusion constraint';
  end if;
end;
$preflight$;

create table public.doctor_accounts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade on update restrict,
  doctor_id uuid not null unique references public.doctors(id) on delete restrict on update restrict,
  created_at timestamptz not null default now()
);

alter table public.doctor_accounts enable row level security;
revoke all on table public.doctor_accounts from public, anon, authenticated, service_role;
grant select on table public.doctor_accounts to service_role;

-- Internal helper: resolve the doctor from the verified Auth ID. Lock doctor
-- before the account mapping to match the lock order of schedule/booking writes.
create function public._lock_doctor_account(p_user_id uuid)
returns uuid
language plpgsql set search_path = pg_catalog as $body$
declare
  linked_doctor_id uuid;
begin
  select a.doctor_id into linked_doctor_id from public.doctor_accounts a where a.auth_user_id = p_user_id;
  if not found then
    raise exception 'Doctor access denied' using errcode = 'PT403';
  end if;
  perform 1 from public.doctors d where d.id = linked_doctor_id for update;
  if not found then
    raise exception 'Doctor access denied' using errcode = 'PT403';
  end if;
  perform 1 from public.doctor_accounts a
    where a.auth_user_id = p_user_id and a.doctor_id = linked_doctor_id for key share;
  if not found then
    raise exception 'Doctor access denied' using errcode = 'PT403';
  end if;
  return linked_doctor_id;
end;
$body$;

-- p_user_id is obtained from a verified Doctor JWT by FastAPI. There is no
-- doctor_id parameter, so the caller cannot choose another doctor's profile.
create function public.create_doctor_slot(p_user_id uuid, p_start_at timestamptz, p_end_at timestamptz)
returns table (id uuid, doctor_id uuid, start_at timestamptz, end_at timestamptz, is_published boolean)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  linked_doctor_id uuid;
  conflict_constraint text;
begin
  linked_doctor_id := public._lock_doctor_account(p_user_id);
  if not exists (select 1 from public.doctors d where d.id = linked_doctor_id and d.active) then
    raise exception 'Doctor is not accepting new slots' using errcode = 'PT409';
  end if;
  if p_start_at is null or p_end_at is null
    or not isfinite(p_start_at) or not isfinite(p_end_at) then
    raise exception 'Invalid slot timestamps' using errcode = 'PT422';
  end if;
  if p_start_at <= clock_timestamp() then
    raise exception 'Slot must start in the future' using errcode = 'PT422';
  end if;
  if p_end_at <= p_start_at then
    raise exception 'Slot end must follow its start' using errcode = 'PT422';
  end if;
  -- Use an exact elapsed duration, regardless of the server display timezone.
  if p_end_at - p_start_at <> interval '30 minutes' then
    raise exception 'Slot duration must be exactly 30 minutes' using errcode = 'PT422';
  end if;

  begin
    return query
      insert into public.appointment_slots as s (doctor_id, start_at, end_at, is_published)
      values (linked_doctor_id, p_start_at, p_end_at, true)
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

create function public.update_doctor_appointment_status(
  p_user_id uuid, p_appointment_id uuid, p_expected_status text, p_status text
)
returns table (id uuid, status text)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  linked_doctor_id uuid;
  appointment_doctor_id uuid;
begin
  linked_doctor_id := public._lock_doctor_account(p_user_id);
  if p_appointment_id is null or p_expected_status is null or p_status is null
    or p_expected_status not in ('confirmed', 'checked_in', 'completed', 'cancelled')
    or p_status not in ('checked_in', 'completed', 'cancelled') then
    raise exception 'Invalid status update input' using errcode = 'PT422';
  end if;

  select s.doctor_id into appointment_doctor_id
  from public.appointments a join public.appointment_slots s on s.id = a.slot_id
  where a.id = p_appointment_id;
  if not found then
    raise exception 'Appointment not found' using errcode = 'PT404';
  end if;
  if appointment_doctor_id <> linked_doctor_id then
    raise exception 'Doctor access denied' using errcode = 'PT403';
  end if;
  if not (
    (p_expected_status = 'confirmed' and p_status in ('checked_in', 'cancelled'))
    or (p_expected_status = 'checked_in' and p_status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid status transition' using errcode = 'PT409';
  end if;

  return query
    update public.appointments a set status = p_status
    from public.appointment_slots s
    where a.id = p_appointment_id and a.slot_id = s.id
      and s.doctor_id = linked_doctor_id and a.status = p_expected_status
    returning a.id, a.status;
  if not found then
    raise exception 'Appointment status changed' using errcode = 'PT409';
  end if;
end;
$body$;

revoke all on function public._lock_doctor_account(uuid),
  public.create_doctor_slot(uuid, timestamptz, timestamptz),
  public.update_doctor_appointment_status(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_doctor_slot(uuid, timestamptz, timestamptz),
  public.update_doctor_appointment_status(uuid, uuid, text, text) to service_role;

commit;
