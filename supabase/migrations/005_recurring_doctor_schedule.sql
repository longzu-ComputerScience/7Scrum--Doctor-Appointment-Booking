-- Issue #31: PRD UPDATED VERSION (t.e6mixvt2az0i).
-- Add a recurring booking path without rewriting appointments or staff grants.
begin;

do $preflight$
begin
  if to_regclass('public.doctor_accounts') is null
    or to_regprocedure('public._lock_doctor_account(uuid)') is null
    or not exists (select 1 from pg_constraint
      where conrelid = to_regclass('public.appointment_slots')
        and conname = 'appointment_slots_no_overlap' and contype = 'x') then
    raise exception 'Apply v2 and migration 004 before recurring schedules';
  end if;
end;
$preflight$;

create table public.patient_profiles (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 100),
  phone text not null check (phone collate "C" ~ '^[+]?[0-9 ()-]{9,20}$'
    and char_length(regexp_replace(phone collate "C", '[^0-9]', '', 'g')) >= 9),
  created_at timestamptz not null default now()
);

create table public.doctor_registration_invites (
  token_hash bytea primary key check (octet_length(token_hash) = 32),
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  invited_email text not null check (char_length(invited_email) between 3 and 320),
  expires_at timestamptz not null check (isfinite(expires_at)),
  consumed_at timestamptz
);

create table public.doctor_schedule_versions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  effective_from date not null check (isfinite(effective_from)),
  created_at timestamptz not null default now(),
  unique (doctor_id, effective_from),
  unique (id, doctor_id)
);

-- ISO weekday (Monday = 1). Minute offsets describe Vietnam wall time.
create table public.doctor_working_hours (
  schedule_version_id uuid not null references public.doctor_schedule_versions(id) on delete restrict,
  weekday smallint not null check (weekday between 1 and 7),
  start_minute integer not null check (start_minute between 0 and 1410),
  end_minute integer not null check (end_minute between 30 and 1440),
  primary key (schedule_version_id, weekday, start_minute),
  check (end_minute - start_minute >= 30 and (end_minute - start_minute) % 30 = 0),
  constraint working_hours_no_overlap exclude using gist (
    schedule_version_id with =, weekday with =, int4range(start_minute, end_minute, '[)') with &&
  )
);

-- Keep every historical slot FK. A retired slot can overlap a replacement,
-- but two published slots for a doctor still cannot overlap.
alter table public.appointment_slots
  add column schedule_version_id uuid,
  add constraint appointment_slots_schedule_version_fkey foreign key (schedule_version_id, doctor_id)
    references public.doctor_schedule_versions(id, doctor_id) on delete restrict,
  add constraint generated_slot_length_check check (
    schedule_version_id is null or end_at - start_at = interval '30 minutes'
  ),
  drop constraint appointment_slots_doctor_start_key,
  drop constraint appointment_slots_no_overlap,
  add constraint appointment_slots_doctor_start_key unique (doctor_id, start_at, end_at),
  add constraint appointment_slots_no_overlap exclude using gist (
    doctor_id with =, tstzrange(start_at, end_at, '[)') with &&
  ) where (is_published);

alter table public.appointments
  add column patient_auth_user_id uuid references public.patient_profiles(auth_user_id) on delete restrict,
  add column booking_doctor_id uuid references public.doctors(id) on delete restrict,
  add column booking_start_at timestamptz,
  add column booking_end_at timestamptz,
  add column schedule_version_id uuid;

-- Avoid modifying historical updated_at via the existing timestamp trigger.
alter table public.appointments disable trigger trg_appointments_updated;
update public.appointments a
set booking_doctor_id = s.doctor_id, booking_start_at = s.start_at, booking_end_at = s.end_at
from public.appointment_slots s where s.id = a.slot_id;
alter table public.appointments enable trigger trg_appointments_updated;

alter table public.appointments
  alter column booking_doctor_id set not null,
  alter column booking_start_at set not null,
  alter column booking_end_at set not null,
  add constraint appointments_schedule_version_fkey foreign key (schedule_version_id, booking_doctor_id)
    references public.doctor_schedule_versions(id, doctor_id) on delete restrict,
  add constraint appointments_booking_period_check check (
    isfinite(booking_start_at) and isfinite(booking_end_at) and booking_end_at > booking_start_at
  ),
  add constraint appointments_recurring_contract_check check (
    (schedule_version_id is null and patient_auth_user_id is null)
    or (schedule_version_id is not null and patient_auth_user_id is not null
      and booking_end_at - booking_start_at = interval '30 minutes'
      and status in ('confirmed', 'completed', 'cancelled'))
  ),
  add constraint appointments_doctor_no_overlap exclude using gist (
    booking_doctor_id with =, tstzrange(booking_start_at, booking_end_at, '[)') with &&
  ) where (status <> 'cancelled');

create index appointments_doctor_start_idx on public.appointments (booking_doctor_id, booking_start_at);
create index appointments_patient_idx on public.appointments (patient_auth_user_id);

create table public.appointment_notifications (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  doctor_id uuid not null references public.doctors(id) on delete restrict,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index appointment_notifications_doctor_idx on public.appointment_notifications (doctor_id, created_at desc);

-- Realtime invalidation payload has no appointment, patient or account data.
create table public.doctor_calendar_revisions (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

create function public._snapshot_booking_period()
returns trigger language plpgsql set search_path = pg_catalog as $body$
begin
  if tg_op = 'UPDATE' then
    if (new.booking_doctor_id, new.booking_start_at, new.booking_end_at, new.patient_auth_user_id, new.schedule_version_id)
        is distinct from
       (old.booking_doctor_id, old.booking_start_at, old.booking_end_at, old.patient_auth_user_id, old.schedule_version_id) then
      raise exception 'Booking identity and time are immutable' using errcode = '23514';
    end if;
    if old.status = 'requested' and new.status = 'confirmed' and exists (
      select 1 from public.doctor_schedule_versions v where v.doctor_id = old.booking_doctor_id
        and v.effective_from <= (old.booking_start_at at time zone 'Asia/Ho_Chi_Minh')::date
    ) then
      raise exception 'Legacy requested appointment requires reconciliation' using errcode = 'PT409';
    end if;
  else
    select s.doctor_id, s.start_at, s.end_at into new.booking_doctor_id, new.booking_start_at, new.booking_end_at
      from public.appointment_slots s where s.id = new.slot_id;
    if not found then
      raise exception 'Slot not found' using errcode = '23503';
    end if;
    -- The old unauthenticated booking RPC must not write a requested
    -- appointment for a date already managed by a recurring schedule.
    if new.schedule_version_id is null and exists (
      select 1 from public.doctor_schedule_versions v where v.doctor_id = new.booking_doctor_id
        and v.effective_from <= (new.booking_start_at at time zone 'Asia/Ho_Chi_Minh')::date
    ) then
      raise exception 'Slot requires the recurring booking API' using errcode = 'PT409';
    end if;
  end if;
  return new;
end;
$body$;

create trigger trg_booking_period before insert or update of booking_doctor_id, booking_start_at, booking_end_at,
  patient_auth_user_id, schedule_version_id, status on public.appointments
  for each row execute function public._snapshot_booking_period();

-- Use the immutable booking snapshot for the location guard.
create or replace function public.guard_doctor_update()
returns trigger language plpgsql set search_path = pg_catalog as $body$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Doctor identity and creation timestamp are immutable' using errcode = '23514';
  end if;
  if (new.address, new.district) is distinct from (old.address, old.district)
    and exists (select 1 from public.appointments a where a.booking_doctor_id = old.id
      and a.booking_start_at > clock_timestamp() and a.status <> 'cancelled') then
    raise exception 'Doctor location has future appointments' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$body$;

create function public._bump_doctor_calendar()
returns trigger language plpgsql set search_path = pg_catalog as $body$
declare
  affected_doctor uuid;
begin
  if tg_table_name = 'appointments' then
    if tg_op = 'UPDATE' and new.status is not distinct from old.status then
      return new;
    end if;
    affected_doctor := new.booking_doctor_id;
  else
    affected_doctor := new.doctor_id;
  end if;
  insert into public.doctor_calendar_revisions as r (doctor_id) values (affected_doctor)
    on conflict (doctor_id) do update set revision = r.revision + 1, updated_at = clock_timestamp();
  return new;
end;
$body$;

create trigger trg_schedule_calendar after insert on public.doctor_schedule_versions
  for each row execute function public._bump_doctor_calendar();
create trigger trg_booking_calendar after insert or update of status on public.appointments
  for each row execute function public._bump_doctor_calendar();

-- A valid selected time must be on the 30-minute grid of one active interval.
create function public._recurring_slot_version(p_doctor_id uuid, p_start_at timestamptz)
returns uuid language sql stable set search_path = pg_catalog as $body$
  with local_time as (
    select p_start_at at time zone 'Asia/Ho_Chi_Minh' as start_local
  ), clock_position as (
    select start_local::date as day, extract(isodow from start_local)::int as weekday,
      (extract(hour from start_local) * 60 + extract(minute from start_local))::int as minute
    from local_time where start_local = date_trunc('minute', start_local)
  ), active_version as (
    select v.id, p.weekday, p.minute from clock_position p
    join public.doctor_schedule_versions v on v.doctor_id = p_doctor_id and v.effective_from <= p.day
    order by v.effective_from desc limit 1
  )
  select v.id from active_version v
  join public.doctor_working_hours h on h.schedule_version_id = v.id and h.weekday = v.weekday
  where v.minute >= h.start_minute and v.minute + 30 <= h.end_minute
    and (v.minute - h.start_minute) % 30 = 0;
$body$;

create function public._reject_manual_recurring_slot()
returns trigger language plpgsql set search_path = pg_catalog as $body$
begin
  if new.schedule_version_id is null and new.is_published and exists (
    select 1 from public.doctor_schedule_versions v where v.doctor_id = new.doctor_id
      and v.effective_from <= (new.start_at at time zone 'Asia/Ho_Chi_Minh')::date
  ) then
    raise exception 'The weekly schedule generates slots automatically' using errcode = 'PT409';
  end if;
  return new;
end;
$body$;

create trigger trg_recurring_slot_source before insert or update of is_published, schedule_version_id
  on public.appointment_slots for each row execute function public._reject_manual_recurring_slot();

-- Call with the doctor row locked. Never delete a slot or move its timestamps.
-- An exact window retains its UUID even when it is retired and later reopened.
create function public._refresh_recurring_slots(p_doctor_id uuid, p_from date, p_to date)
returns void language plpgsql set search_path = pg_catalog as $body$
begin
  update public.appointment_slots s set is_published = false
  where s.doctor_id = p_doctor_id and s.is_published
    and s.start_at >= (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and s.start_at < ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and s.start_at > statement_timestamp()
    and exists (select 1 from public.doctor_schedule_versions v where v.doctor_id = p_doctor_id
      and v.effective_from <= (s.start_at at time zone 'Asia/Ho_Chi_Minh')::date)
    and (s.end_at - s.start_at <> interval '30 minutes'
      or public._recurring_slot_version(p_doctor_id, s.start_at) is null);

  insert into public.appointment_slots as s (doctor_id, start_at, end_at, schedule_version_id, is_published)
  select p_doctor_id, candidate.begins, candidate.begins + interval '30 minutes', v.id, true
  from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as day(local_day)
  cross join lateral (
    select sv.id from public.doctor_schedule_versions sv
    where sv.doctor_id = p_doctor_id and sv.effective_from <= day.local_day::date
    order by sv.effective_from desc limit 1
  ) v
  join public.doctor_working_hours h on h.schedule_version_id = v.id
    and h.weekday = extract(isodow from day.local_day)::int
  cross join lateral generate_series(h.start_minute, h.end_minute - 30, 30) as segment(minute)
  cross join lateral (
    select (day.local_day + make_interval(mins => segment.minute)) at time zone 'Asia/Ho_Chi_Minh' as begins
  ) candidate
  where candidate.begins > statement_timestamp()
    -- Preserve any published legacy slot crossing the date-window boundary.
    and not exists (select 1 from public.appointment_slots other
      where other.doctor_id = p_doctor_id and other.is_published
        and other.start_at <> candidate.begins
        and tstzrange(other.start_at, other.end_at, '[)')
          && tstzrange(candidate.begins, candidate.begins + interval '30 minutes', '[)'))
  on conflict on constraint appointment_slots_doctor_start_key do update
    set schedule_version_id = excluded.schedule_version_id, is_published = true
    where not s.is_published or s.schedule_version_id is distinct from excluded.schedule_version_id;
end;
$body$;

-- Call only after locking the doctor. Invalid intervals and conflicts roll
-- back both the version and its calendar revision with the caller transaction.
create function public._write_doctor_schedule(p_doctor_id uuid, p_effective_from date, p_intervals jsonb)
returns uuid language plpgsql set search_path = pg_catalog as $body$
declare
  version_id uuid;
  next_effective date;
  conflicts jsonb;
  item jsonb;
  weekday_value numeric;
  start_value numeric;
  end_value numeric;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if jsonb_typeof(p_intervals) is distinct from 'array' then
    raise exception 'Working intervals must be an array' using errcode = 'PT422';
  end if;
  if jsonb_array_length(p_intervals) not between 1 and 336 then
    raise exception 'Provide at least one working interval' using errcode = 'PT422';
  end if;
  if exists (select 1 from public.doctor_schedule_versions v
      where v.doctor_id = p_doctor_id and v.effective_from = p_effective_from) then
    raise exception 'A schedule already starts on that date' using errcode = 'PT409';
  end if;

  insert into public.doctor_schedule_versions (doctor_id, effective_from)
    values (p_doctor_id, p_effective_from) returning id into version_id;
  begin
    for item in select value from jsonb_array_elements(p_intervals) loop
      if jsonb_typeof(item->'weekday') is distinct from 'number'
        or jsonb_typeof(item->'startMinute') is distinct from 'number'
        or jsonb_typeof(item->'endMinute') is distinct from 'number' then
        raise exception 'Working interval fields must be numeric' using errcode = 'PT422';
      end if;
      weekday_value := (item->>'weekday')::numeric;
      start_value := (item->>'startMinute')::numeric;
      end_value := (item->>'endMinute')::numeric;
      if weekday_value <> trunc(weekday_value) or start_value <> trunc(start_value) or end_value <> trunc(end_value)
        or weekday_value not between 1 and 7 or start_value not between 0 and 1410
        or end_value not between 30 and 1440 or end_value - start_value < 30
        or mod(end_value - start_value, 30) <> 0 then
        raise exception 'Invalid working interval' using errcode = 'PT422';
      end if;
      insert into public.doctor_working_hours (schedule_version_id, weekday, start_minute, end_minute)
        values (version_id, weekday_value::smallint, start_value::int, end_value::int);
    end loop;
  exception when exclusion_violation or unique_violation then
    raise exception 'Working intervals on the same day overlap' using errcode = 'PT422';
  end;

  select min(v.effective_from) into next_effective from public.doctor_schedule_versions v
    where v.doctor_id = p_doctor_id and v.effective_from > p_effective_from;
  select jsonb_agg(jsonb_build_object('appointmentId', a.id, 'startAt', a.booking_start_at,
    'endAt', a.booking_end_at) order by a.booking_start_at, a.id) into conflicts
  from public.appointments a
  where a.booking_doctor_id = p_doctor_id and a.status = 'confirmed' and a.booking_start_at > clock_timestamp()
    and a.booking_start_at >= p_effective_from::timestamp at time zone 'Asia/Ho_Chi_Minh'
    and (next_effective is null or a.booking_start_at < next_effective::timestamp at time zone 'Asia/Ho_Chi_Minh')
    and (a.booking_end_at - a.booking_start_at <> interval '30 minutes'
      or public._recurring_slot_version(p_doctor_id, a.booking_start_at) is distinct from version_id);
  if conflicts is not null then
    raise exception 'Schedule conflicts with confirmed appointments'
      using errcode = 'PT409', detail = conflicts::text;
  end if;
  perform public._refresh_recurring_slots(p_doctor_id, today, today + 30);
  return version_id;
end;
$body$;

create function public.save_doctor_working_hours(p_user_id uuid, p_effective_from date, p_intervals jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog as $body$
declare
  doctor_uuid uuid := public._lock_doctor_account(p_user_id);
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if p_effective_from is null or not isfinite(p_effective_from) or p_effective_from < today
    or (p_effective_from = today and exists (
      select 1 from public.doctor_schedule_versions v where v.doctor_id = doctor_uuid
    )) then
    raise exception 'Schedule changes require a future effective date' using errcode = 'PT422';
  end if;
  return public._write_doctor_schedule(doctor_uuid, p_effective_from, p_intervals);
end;
$body$;

-- Auth creates and verifies the user. This RPC is the atomic application-side
-- completion step. Passwords and plaintext invitation codes are never stored here.
create function public.complete_doctor_registration(p_user_id uuid, p_invite_code text, p_intervals jsonb)
returns table (doctor_id uuid, schedule_version_id uuid)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  auth_email text;
  invite_hash bytea;
  invited_doctor uuid;
  invitation public.doctor_registration_invites%rowtype;
begin
  select lower(btrim(u.email)) into auth_email from auth.users u where u.id = p_user_id for update;
  if auth_email is null or p_invite_code is null or char_length(p_invite_code) not between 24 and 128 then
    raise exception 'Invalid invitation' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.patient_profiles p where p.auth_user_id = p_user_id)
    or exists (select 1 from public.doctor_accounts a where a.auth_user_id = p_user_id) then
    raise exception 'Account already has a role' using errcode = 'PT409';
  end if;
  invite_hash := sha256(convert_to(p_invite_code, 'UTF8'));
  select i.doctor_id into invited_doctor from public.doctor_registration_invites i where i.token_hash = invite_hash;
  if not found then
    raise exception 'Invalid invitation' using errcode = 'PT403';
  end if;
  perform 1 from public.doctors d where d.id = invited_doctor for update;
  select i.* into invitation from public.doctor_registration_invites i
    where i.token_hash = invite_hash and i.doctor_id = invited_doctor for update;
  if not found or invitation.consumed_at is not null or invitation.expires_at <= clock_timestamp()
    or lower(btrim(invitation.invited_email)) <> auth_email then
    raise exception 'Invalid invitation' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.doctor_accounts a where a.doctor_id = invitation.doctor_id) then
    raise exception 'Doctor profile is already linked' using errcode = 'PT409';
  end if;
  insert into public.doctor_accounts (auth_user_id, doctor_id) values (p_user_id, invitation.doctor_id);
  schedule_version_id := public._write_doctor_schedule(invitation.doctor_id,
    (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date, p_intervals);
  update public.doctor_registration_invites i set consumed_at = clock_timestamp() where i.token_hash = invite_hash;
  doctor_id := invited_doctor;
  return next;
end;
$body$;

create function public.save_patient_profile(p_user_id uuid, p_full_name text, p_phone text)
returns uuid language plpgsql security definer set search_path = pg_catalog as $body$
begin
  perform 1 from auth.users u where u.id = p_user_id for update;
  if not found or exists (select 1 from public.doctor_accounts a where a.auth_user_id = p_user_id) then
    raise exception 'Patient access denied' using errcode = 'PT403';
  end if;
  if p_full_name is null or p_phone is null then
    raise exception 'Name and phone are required' using errcode = 'PT422';
  end if;
  insert into public.patient_profiles as p (auth_user_id, full_name, phone)
    values (p_user_id, btrim(normalize(p_full_name, NFC)), btrim(p_phone))
  on conflict (auth_user_id) do update set full_name = excluded.full_name, phone = excluded.phone;
  return p_user_id;
exception when check_violation then
  raise exception 'Invalid patient profile' using errcode = 'PT422';
end;
$body$;

create function public.list_doctor_availability(p_doctor_id uuid, p_from date, p_to date)
returns table (slot_id uuid, start_at timestamptz, end_at timestamptz)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if p_doctor_id is null or p_from is null or p_to is null
    or not isfinite(p_from) or not isfinite(p_to) or p_to < p_from then
    raise exception 'Invalid availability date range' using errcode = 'PT422';
  end if;
  if p_to::timestamp - p_from::timestamp > interval '30 days' then
    raise exception 'Availability query is limited to 31 calendar dates' using errcode = 'PT422';
  end if;
  p_from := greatest(p_from, today);
  p_to := least(p_to, today + 30);
  if p_to < p_from then
    return;
  end if;
  perform 1 from public.doctors d where d.id = p_doctor_id and d.active for update;
  if not found then
    return;
  end if;
  perform public._refresh_recurring_slots(p_doctor_id, p_from, p_to);
  return query
    select s.id, s.start_at, s.end_at from public.appointment_slots s
    where s.doctor_id = p_doctor_id and s.is_published and s.schedule_version_id is not null
      and s.start_at >= (p_from::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and s.start_at < ((p_to + 1)::timestamp at time zone 'Asia/Ho_Chi_Minh')
      and s.start_at > clock_timestamp()
      and not exists (select 1 from public.appointments a where a.booking_doctor_id = p_doctor_id
        and a.status <> 'cancelled' and tstzrange(a.booking_start_at, a.booking_end_at, '[)')
          && tstzrange(s.start_at, s.end_at, '[)'))
    order by s.start_at;
end;
$body$;

create function public.book_recurring_appointment(
  p_user_id uuid, p_slot_id uuid, p_notes text default ''
)
returns table (appointment_id uuid, booking_reference text, status text, start_at timestamptz, end_at timestamptz)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  patient public.patient_profiles%rowtype;
  target_doctor_id uuid;
  slot public.appointment_slots%rowtype;
  doctor_active boolean;
  conflict_constraint text;
begin
  select p.* into patient from public.patient_profiles p where p.auth_user_id = p_user_id for share;
  if not found then
    raise exception 'Patient access denied' using errcode = 'PT403';
  end if;
  if p_slot_id is null or p_notes is null or char_length(btrim(normalize(p_notes, NFC))) > 500 then
    raise exception 'Invalid booking input' using errcode = 'PT422';
  end if;
  select s.doctor_id into target_doctor_id from public.appointment_slots s where s.id = p_slot_id;
  select d.active into doctor_active from public.doctors d where d.id = target_doctor_id for update;
  if not found or not doctor_active then
    raise exception 'Slot unavailable' using errcode = 'PT409';
  end if;
  select s.* into slot from public.appointment_slots s where s.id = p_slot_id for update;
  if not found or slot.doctor_id <> target_doctor_id or not slot.is_published
    or slot.start_at <= clock_timestamp() or slot.schedule_version_id is null
    or slot.schedule_version_id is distinct from public._recurring_slot_version(target_doctor_id, slot.start_at) then
    raise exception 'Slot no longer belongs to the working schedule' using errcode = 'PT409';
  end if;

  for attempt in 1..3 loop
    begin
      insert into public.appointments as a (slot_id, patient_auth_user_id,
        schedule_version_id, patient_name, patient_phone, notes, status)
      values (p_slot_id, p_user_id, slot.schedule_version_id,
        patient.full_name, patient.phone, btrim(normalize(p_notes, NFC)), 'confirmed')
      returning a.id, a.booking_reference, a.status, a.booking_start_at, a.booking_end_at
        into appointment_id, booking_reference, status, start_at, end_at;
      insert into public.appointment_notifications (appointment_id, doctor_id)
        values (appointment_id, target_doctor_id);
      return next;
      return;
    exception when exclusion_violation or unique_violation then
      get stacked diagnostics conflict_constraint = constraint_name;
      if conflict_constraint in ('appointments_doctor_no_overlap', 'appointments_one_active_per_slot') then
        raise exception 'Slot unavailable' using errcode = 'PT409';
      elsif conflict_constraint <> 'appointments_booking_reference_key' then
        raise;
      end if;
    end;
  end loop;
  raise exception 'Booking reference unavailable' using errcode = 'PT503';
end;
$body$;

create function public.update_recurring_appointment_status(p_user_id uuid, p_appointment_id uuid, p_status text)
returns table (id uuid, status text)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  doctor_uuid uuid := public._lock_doctor_account(p_user_id);
  owner_id uuid;
begin
  if p_appointment_id is null or p_status is null or p_status not in ('completed', 'cancelled') then
    raise exception 'Invalid appointment status' using errcode = 'PT422';
  end if;
  select a.booking_doctor_id into owner_id from public.appointments a where a.id = p_appointment_id;
  if not found then
    raise exception 'Appointment not found' using errcode = 'PT404';
  end if;
  if owner_id <> doctor_uuid then
    raise exception 'Doctor access denied' using errcode = 'PT403';
  end if;
  return query update public.appointments a set status = p_status
    where a.id = p_appointment_id and a.booking_doctor_id = doctor_uuid and a.status = 'confirmed'
    returning a.id, a.status;
  if not found then
    raise exception 'Only a confirmed appointment can change status' using errcode = 'PT409';
  end if;
end;
$body$;

create function public.mark_doctor_notification_read(p_user_id uuid, p_notification_id uuid)
returns timestamptz language plpgsql security definer set search_path = pg_catalog as $body$
declare
  doctor_uuid uuid := public._lock_doctor_account(p_user_id);
  read_time timestamptz;
begin
  update public.appointment_notifications n set read_at = coalesce(n.read_at, clock_timestamp())
    where n.id = p_notification_id and n.doctor_id = doctor_uuid returning n.read_at into read_time;
  if not found then
    raise exception 'Notification not found' using errcode = 'PT404';
  end if;
  return read_time;
end;
$body$;

-- Supabase Realtime clients can subscribe to their doctor notifications and
-- PII-free calendar revisions. The API returns appointment details separately.
create function public._is_current_doctor(p_doctor_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $body$
  select exists (select 1 from public.doctor_accounts a
    where a.auth_user_id = auth.uid() and a.doctor_id = p_doctor_id);
$body$;

alter table public.patient_profiles enable row level security;
alter table public.doctor_registration_invites enable row level security;
alter table public.doctor_schedule_versions enable row level security;
alter table public.doctor_working_hours enable row level security;
alter table public.appointment_notifications enable row level security;
alter table public.doctor_calendar_revisions enable row level security;

revoke all on table public.patient_profiles, public.doctor_registration_invites, public.doctor_schedule_versions,
  public.doctor_working_hours, public.appointment_notifications, public.doctor_calendar_revisions
  from public, anon, authenticated, service_role;
grant select on table public.patient_profiles, public.doctor_schedule_versions, public.doctor_working_hours,
  public.appointment_notifications, public.doctor_calendar_revisions to service_role;
grant select on table public.appointment_notifications, public.doctor_calendar_revisions to authenticated;
create policy doctor_owns_notification on public.appointment_notifications for select to authenticated
  using (public._is_current_doctor(doctor_id));
create policy read_calendar_revision on public.doctor_calendar_revisions for select to authenticated using (true);

revoke all on function public._snapshot_booking_period(), public._bump_doctor_calendar(),
  public._recurring_slot_version(uuid, timestamptz), public._reject_manual_recurring_slot(),
  public._refresh_recurring_slots(uuid, date, date), public._write_doctor_schedule(uuid, date, jsonb),
  public.save_doctor_working_hours(uuid, date, jsonb), public.complete_doctor_registration(uuid, text, jsonb),
  public.save_patient_profile(uuid, text, text), public.list_doctor_availability(uuid, date, date),
  public.book_recurring_appointment(uuid, uuid, text),
  public.update_recurring_appointment_status(uuid, uuid, text), public.mark_doctor_notification_read(uuid, uuid),
  public._is_current_doctor(uuid) from public, anon, authenticated, service_role;
grant execute on function public.save_doctor_working_hours(uuid, date, jsonb),
  public.complete_doctor_registration(uuid, text, jsonb), public.save_patient_profile(uuid, text, text),
  public.list_doctor_availability(uuid, date, date), public.book_recurring_appointment(uuid, uuid, text),
  public.update_recurring_appointment_status(uuid, uuid, text), public.mark_doctor_notification_read(uuid, uuid)
  to service_role;
grant execute on function public._is_current_doctor(uuid) to authenticated;

do $realtime$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'doctor_calendar_revisions') then
      alter publication supabase_realtime add table public.doctor_calendar_revisions;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
        and schemaname = 'public' and tablename = 'appointment_notifications') then
      alter publication supabase_realtime add table public.appointment_notifications;
    end if;
  end if;
end;
$realtime$;

commit;
