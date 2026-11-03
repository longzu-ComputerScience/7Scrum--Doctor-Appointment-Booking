-- 7Scrum MVP: use a dedicated Supabase project with synthetic demo data.
create extension if not exists pgcrypto;

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  district text not null,
  active boolean not null default true
);

create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text not null,
  bio text not null default '',
  clinic_id uuid not null references public.clinics(id),
  active boolean not null default true
);
create index if not exists doctors_clinic_idx on public.doctors(clinic_id);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id),
  name text not null,
  unique (clinic_id, name)
);

create table if not exists public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id),
  clinic_id uuid not null references public.clinics(id),
  room_id uuid references public.rooms(id),
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_published boolean not null default true,
  check (end_at > start_at),
  unique (doctor_id, start_at)
);
create index if not exists slots_doctor_start_idx on public.appointment_slots(doctor_id, start_at);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.appointment_slots(id),
  patient_name text not null,
  patient_phone text not null,
  notes text not null default '',
  status text not null default 'requested' check (status in ('requested','confirmed','checked_in','completed','cancelled')),
  booking_reference text not null unique default upper(left(replace(gen_random_uuid()::text, '-', ''), 12)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A slot can only have one non-cancelled booking, even under concurrent requests.
create unique index if not exists appointments_one_active_per_slot
  on public.appointments (slot_id) where status <> 'cancelled';

create table if not exists public.staff_members (
  user_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id),
  primary key (user_id, clinic_id)
);

create or replace function public.touch_appointment_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_appointments_updated on public.appointments;
create trigger trg_appointments_updated before update on public.appointments
  for each row execute function public.touch_appointment_updated_at();

-- API calls this with the service-role key, never from the browser.
-- A single database statement checks eligibility then inserts. Unique index prevents races.
create or replace function public.create_appointment(
  p_slot_id uuid,
  p_patient_name text,
  p_patient_phone text,
  p_notes text default ''
)
returns table (appointment_id uuid, booking_reference text)
language plpgsql security definer
set search_path = public
as $$
begin
  if length(trim(p_patient_name)) < 2 or length(trim(p_patient_name)) > 100
     or length(trim(p_patient_phone)) < 9 or length(trim(p_patient_phone)) > 20
     or length(coalesce(p_notes,'')) > 500
  then
    raise exception 'Invalid booking input' using errcode = 'P0001';
  end if;

  insert into public.appointments (slot_id, patient_name, patient_phone, notes)
  select s.id, trim(p_patient_name), trim(p_patient_phone), coalesce(p_notes,'')
  from public.appointment_slots s
  join public.doctors d on d.id = s.doctor_id and d.clinic_id = s.clinic_id and d.active
  join public.clinics c on c.id = s.clinic_id and c.active
  where s.id = p_slot_id and s.is_published and s.start_at > now()
  returning appointments.id, appointments.booking_reference
  into appointment_id, booking_reference;

  if not found then
    raise exception 'Slot is unavailable' using errcode = 'P0001';
  end if;
  return next;
exception
  when unique_violation then
    raise exception 'Slot is already booked' using errcode = 'P0001';
end;
$$;

-- All DB writes/reads go through the server-side API in the MVP.
-- No direct anon/authenticated access to sensitive appointment or staff tables.
alter table public.clinics enable row level security;
alter table public.doctors enable row level security;
alter table public.rooms enable row level security;
alter table public.appointment_slots enable row level security;
alter table public.appointments enable row level security;
alter table public.staff_members enable row level security;

revoke all on function public.create_appointment(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_appointment(uuid, text, text, text) to service_role;
