-- 7Scrum v2. Standalone bootstrap for a new Supabase database.
-- Contract: docs/DATA_DICTIONARY.md and docs/API_CONTRACT_V2.md.
-- Run the whole file once as the database owner via Supabase SQL Editor.
-- Existing v1 projects require a separate data-preserving migration.
-- Auth is provided by Supabase. Seed v2 data separately via an admin connection.

begin;

do $preflight$
begin
  if to_regclass('auth.users') is null
    or to_regrole('anon') is null
    or to_regrole('authenticated') is null
    or to_regrole('service_role') is null then
    raise exception 'This script requires Supabase Auth and the Supabase database roles';
  end if;
  if exists (
    select 1 from unnest(array['clinics', 'rooms', 'doctors', 'appointment_slots',
      'appointments', 'staff_members']) as existing(name)
    where to_regclass('public.' || existing.name) is not null
  ) then
    raise exception 'Use a new Supabase database. Existing booking tables need a separate migration';
  end if;
end;
$preflight$;

create extension if not exists btree_gist;

create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  specialty text not null check (char_length(specialty) between 1 and 80),
  bio text not null default '' check (char_length(bio) <= 2000),
  address text not null check (char_length(address) between 1 and 300),
  district text not null check (char_length(district) between 1 and 80),
  certificates jsonb not null default '[]'::jsonb,
  rating numeric(3,2) default null,
  rating_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint doctors_certificates_array_check check (
    case when jsonb_typeof(certificates) = 'array'
      then jsonb_array_length(certificates) <= 20 else false end
  ),
  constraint doctors_rating_consistency_check check (
    (rating is null and rating_count = 0)
    or (rating is not null and rating between 1 and 5 and rating_count > 0)
  )
);

comment on column public.doctors.certificates is
  'Certificate[] with name, issuer, issuedYear, credentialUrl. Admin imports validate each object as specified in the data dictionary.';
comment on column public.doctors.rating is
  'Trusted rating snapshot. Admin imports validate the original precision before PostgreSQL rounds numeric(3,2). Update rating and rating_count together.';

create table public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_published boolean not null default true,
  constraint appointment_slots_doctor_id_fkey foreign key (doctor_id)
    references public.doctors(id) on delete restrict on update restrict,
  constraint appointment_slots_time_check check (
    isfinite(start_at) and isfinite(end_at) and end_at > start_at
  ),
  constraint appointment_slots_doctor_start_key unique (doctor_id, start_at),
  constraint appointment_slots_no_overlap exclude using gist (
    doctor_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null,
  patient_name text not null check (char_length(patient_name) between 2 and 100),
  patient_phone text not null,
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'requested',
  booking_reference text not null default upper(left(replace(gen_random_uuid()::text, '-', ''), 12)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_slot_id_fkey foreign key (slot_id)
    references public.appointment_slots(id) on delete restrict on update restrict,
  constraint appointments_patient_phone_check check (
    patient_phone collate "C" ~ '^[+]?[0-9 ()-]{9,20}$'
    and char_length(regexp_replace(patient_phone collate "C", '[^0-9]', '', 'g')) >= 9
  ),
  constraint appointments_status_check check (
    status in ('requested', 'confirmed', 'checked_in', 'completed', 'cancelled')
  ),
  constraint appointments_booking_reference_key unique (booking_reference),
  constraint appointments_booking_reference_format_check check (
    booking_reference collate "C" ~ '^[0-9A-F]{12}$'
  )
);

create table public.staff_members (
  user_id uuid not null,
  doctor_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, doctor_id),
  constraint staff_members_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade on update restrict,
  constraint staff_members_doctor_id_fkey foreign key (doctor_id)
    references public.doctors(id) on delete restrict on update restrict
);

create unique index appointments_one_active_per_slot
  on public.appointments (slot_id) where status <> 'cancelled';
create index appointments_slot_id_idx on public.appointments (slot_id);
create index appointments_created_at_id_idx on public.appointments (created_at desc, id desc);
create index staff_members_doctor_id_idx on public.staff_members (doctor_id);

-- Preserve historical links and refresh timestamps on updates.
create function public.guard_doctor_update()
returns trigger language plpgsql set search_path = pg_catalog as $body$
begin
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Doctor identity and creation timestamp are immutable' using errcode = '23514';
  end if;
  if (new.address, new.district) is distinct from (old.address, old.district)
    and exists (
      select 1 from public.appointment_slots s
      join public.appointments a on a.slot_id = s.id
      where s.doctor_id = old.id and s.start_at > clock_timestamp() and a.status <> 'cancelled'
    ) then
    raise exception 'Doctor location has future appointments' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$body$;

create function public.guard_slot_update()
returns trigger language plpgsql set search_path = pg_catalog as $body$
begin
  if new.id is distinct from old.id then
    raise exception 'Slot ID is immutable' using errcode = '23514';
  end if;
  if (new.doctor_id, new.start_at, new.end_at) is distinct from (old.doctor_id, old.start_at, old.end_at)
    and exists (select 1 from public.appointments a where a.slot_id = old.id) then
    raise exception 'Slot with appointment history cannot change doctor or time' using errcode = '23514';
  end if;
  return new;
end;
$body$;

create function public.guard_appointment_update()
returns trigger language plpgsql set search_path = pg_catalog as $body$
begin
  if (new.id, new.slot_id, new.created_at) is distinct from (old.id, old.slot_id, old.created_at) then
    raise exception 'Appointment identity, slot and creation timestamp are immutable' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$body$;

create trigger trg_doctors_updated before update on public.doctors
  for each row execute function public.guard_doctor_update();
create trigger trg_slots_guard before update on public.appointment_slots
  for each row execute function public.guard_slot_update();
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.guard_appointment_update();

create function public.create_appointment(
  p_slot_id uuid,
  p_patient_name text,
  p_patient_phone text,
  p_notes text default ''
)
returns table (appointment_id uuid, booking_reference text)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  -- Unicode White_Space code points. The BE applies its validator before the RPC.
  whitespace constant text := U&'\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000';
  patient_name_value text := btrim(normalize(p_patient_name, NFC), whitespace);
  patient_phone_value text := btrim(normalize(p_patient_phone, NFC), whitespace);
  notes_value text := btrim(normalize(p_notes, NFC), whitespace);
  target_doctor_id uuid;
  doctor_active boolean;
  target_slot public.appointment_slots%rowtype;
  conflict_constraint text;
begin
  if p_slot_id is null or patient_name_value is null or patient_phone_value is null or notes_value is null
    or char_length(patient_name_value) not between 2 and 100
    or patient_phone_value collate "C" !~ '^[+]?[0-9 ()-]{9,20}$'
    or char_length(regexp_replace(patient_phone_value collate "C", '[^0-9]', '', 'g')) < 9
    or char_length(notes_value) > 500 then
    raise exception 'Invalid booking input' using errcode = '22023';
  end if;

  select s.doctor_id into target_doctor_id from public.appointment_slots s where s.id = p_slot_id;
  if not found then
    raise exception 'Slot unavailable' using errcode = 'PT409';
  end if;
  select d.active into doctor_active from public.doctors d where d.id = target_doctor_id for update;
  if not found or not doctor_active then
    raise exception 'Slot unavailable' using errcode = 'PT409';
  end if;
  select s.* into target_slot from public.appointment_slots s where s.id = p_slot_id for update;
  if not found or target_slot.doctor_id <> target_doctor_id
    or not target_slot.is_published or target_slot.start_at <= clock_timestamp() then
    raise exception 'Slot unavailable' using errcode = 'PT409';
  end if;

  for attempt in 1..3 loop
    begin
      -- Each failed insert rolls back to the implicit subtransaction boundary.
      insert into public.appointments as a (slot_id, patient_name, patient_phone, notes)
      values (p_slot_id, patient_name_value, patient_phone_value, notes_value)
      returning a.id, a.booking_reference into appointment_id, booking_reference;
      return next;
      return;
    exception when unique_violation then
      get stacked diagnostics conflict_constraint = constraint_name;
      if conflict_constraint = 'appointments_one_active_per_slot' then
        raise exception 'Slot unavailable' using errcode = 'PT409';
      elsif conflict_constraint <> 'appointments_booking_reference_key' then
        raise;
      end if;
    end;
  end loop;
  raise exception 'Booking reference unavailable' using errcode = 'PT503';
end;
$body$;

-- BE supplies p_user_id from the verified JWT and p_expected_status from the
-- staff-scoped read. Revalidate both under locks in the write transaction.
create function public.update_appointment_status(
  p_appointment_id uuid,
  p_user_id uuid,
  p_expected_status text,
  p_status text
)
returns table (id uuid, status text)
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  target_doctor_id uuid;
  target_slot_id uuid;
begin
  if p_appointment_id is null or p_user_id is null or p_expected_status is null
    or p_expected_status not in ('requested', 'confirmed', 'checked_in', 'completed', 'cancelled')
    or p_status is null or p_status not in ('confirmed', 'checked_in', 'completed', 'cancelled') then
    raise exception 'Invalid status update input' using errcode = '22023';
  end if;

  select s.doctor_id, s.id into target_doctor_id, target_slot_id
  from public.appointments a join public.appointment_slots s on s.id = a.slot_id
  where a.id = p_appointment_id;
  if not found then
    raise exception 'Appointment not found' using errcode = 'PT404';
  end if;
  perform 1 from public.doctors d where d.id = target_doctor_id for update;
  perform 1 from public.appointment_slots s
    where s.id = target_slot_id and s.doctor_id = target_doctor_id for update;
  if not found then
    raise exception 'Appointment slot changed' using errcode = 'PT409';
  end if;
  perform 1 from public.appointments a where a.id = p_appointment_id and a.slot_id = target_slot_id for update;
  if not found then
    raise exception 'Appointment not found' using errcode = 'PT404';
  end if;
  perform 1 from public.staff_members m
    where m.user_id = p_user_id and m.doctor_id = target_doctor_id for key share;
  if not found then
    raise exception 'Staff access denied' using errcode = 'PT403';
  end if;

  if not (
    (p_expected_status = 'requested' and p_status in ('confirmed', 'cancelled'))
    or (p_expected_status = 'confirmed' and p_status in ('checked_in', 'cancelled'))
    or (p_expected_status = 'checked_in' and p_status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid status transition' using errcode = 'PT409';
  end if;
  return query update public.appointments a set status = p_status
    where a.id = p_appointment_id and a.status = p_expected_status
    returning a.id, a.status;
  if not found then
    raise exception 'Appointment status changed' using errcode = 'PT409';
  end if;
end;
$body$;

alter table public.doctors enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.staff_members enable row level security;

-- Server reads with service_role. Use RPCs for booking/status writes and the
-- database owner for trusted catalog, availability and membership administration.
revoke all on table public.doctors, public.appointment_slots, public.appointments, public.staff_members
  from public, anon, authenticated, service_role;
grant select on table public.doctors, public.appointment_slots, public.appointments, public.staff_members to service_role;

revoke all on function public.guard_doctor_update(), public.guard_slot_update(), public.guard_appointment_update(),
  public.create_appointment(uuid, text, text, text), public.update_appointment_status(uuid, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_appointment(uuid, text, text, text),
  public.update_appointment_status(uuid, uuid, text, text) to service_role;

commit;
