-- Compatibility migration. On v2, 001_init.sql already defines booking and slot rules.
do $legacy_v1$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'doctors' and column_name = 'certificates'
  ) then
    return;
  end if;

  execute $v1_ddl$
-- PO-approved 2-day MVP: staff-managed availability and immediately confirmed bookings.
-- Run after 001_init.sql. PostgreSQL constraints are the concurrency authority.
create extension if not exists btree_gist;

-- Preserve the old API compatibility with an explicit booking status; newly created
-- appointments are confirmed because the PO demo requires immediate visibility.
alter table public.appointments alter column status set default 'confirmed';

-- Avoid overlapping doctor appointments even when start times differ.
-- Existing sample slots are non-overlapping. Resolve legacy overlaps before applying.
alter table public.appointment_slots
  add constraint appointment_slots_doctor_no_overlap
  exclude using gist (
    doctor_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  );
-- Room assignment is optional in the MVP; when assigned, room cannot overlap.
alter table public.appointment_slots
  add constraint appointment_slots_room_no_overlap
  exclude using gist (
    room_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (room_id is not null);

create or replace function public.validate_slot_membership()
returns trigger language plpgsql set search_path=public as $$
begin
  if not exists (
    select 1 from public.doctors d
    where d.id = new.doctor_id and d.clinic_id = new.clinic_id and d.active
  ) then
    raise exception 'Doctor does not belong to this active clinic' using errcode = '23514';
  end if;
  if new.room_id is not null and not exists (
    select 1 from public.rooms r where r.id = new.room_id and r.clinic_id = new.clinic_id
  ) then
    raise exception 'Room does not belong to this clinic' using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_slot_membership on public.appointment_slots;
create trigger trg_slot_membership before insert or update of doctor_id, clinic_id, room_id
  on public.appointment_slots for each row execute function public.validate_slot_membership();

-- Explicitly confirmed booking; partial unique index from 001 prevents double booking.
create or replace function public.create_appointment(
  p_slot_id uuid, p_patient_name text, p_patient_phone text, p_notes text default ''
)
returns table (appointment_id uuid, booking_reference text)
language plpgsql security definer set search_path=public as $$
begin
  if length(trim(p_patient_name)) < 2 or length(trim(p_patient_name)) > 100
    or length(trim(p_patient_phone)) < 9 or length(trim(p_patient_phone)) > 20
    or length(coalesce(p_notes,'')) > 500
  then
    raise exception 'Invalid booking input' using errcode='P0001';
  end if;
  insert into public.appointments (slot_id, patient_name, patient_phone, notes, status)
  select s.id, trim(p_patient_name), trim(p_patient_phone), coalesce(p_notes,''), 'confirmed'
  from public.appointment_slots s
  join public.doctors d on d.id=s.doctor_id and d.clinic_id=s.clinic_id and d.active
  join public.clinics c on c.id=s.clinic_id and c.active
  where s.id=p_slot_id and s.is_published and s.start_at>now()
  returning appointments.id, appointments.booking_reference
  into appointment_id, booking_reference;
  if not found then
    raise exception 'Slot unavailable' using errcode='P0001';
  end if;
  return next;
exception when unique_violation then
  raise exception 'Slot already booked' using errcode='P0001';
end;
$$;
revoke all on function public.create_appointment(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.create_appointment(uuid,text,text,text) to service_role;

-- Intentionally no anonymous INSERT into appointment_slots. Only FastAPI,
-- after checking JWT + staff_members, writes through the service-role client.
  $v1_ddl$;
end;
$legacy_v1$;
