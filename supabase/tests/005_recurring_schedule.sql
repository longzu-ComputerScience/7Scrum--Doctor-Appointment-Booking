-- Run only on a disposable v2 + 004 + 005 database with the v2 demo seed.
-- Test identities and changes are rolled back at the end.
begin;

insert into auth.users (id, email) values
  ('d0500000-0000-4000-8000-000000000001', 'doctor-005@example.invalid'),
  ('d0500000-0000-4000-8000-000000000002', 'patient-005-a@example.invalid'),
  ('d0500000-0000-4000-8000-000000000003', 'patient-005-b@example.invalid');

do $test$
declare
  doctor_user constant uuid := 'd0500000-0000-4000-8000-000000000001';
  patient_a constant uuid := 'd0500000-0000-4000-8000-000000000002';
  patient_b constant uuid := 'd0500000-0000-4000-8000-000000000003';
  target_doctor constant uuid := '10000000-0000-4000-8000-000000000001';
  invite_code constant text := 'disposable-invite-005-test-only';
  local_day date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date + 21;
  starts timestamptz := (local_day + time '09:00') at time zone 'Asia/Ho_Chi_Minh';
  weekday integer := extract(isodow from local_day);
  intervals jsonb := jsonb_build_array(
    jsonb_build_object('weekday', weekday, 'startMinute', 540, 'endMinute', 600),
    jsonb_build_object('weekday', weekday, 'startMinute', 780, 'endMinute', 810)
  );
  slot_uuid uuid;
  manual_uuid uuid;
  reusable_uuid uuid;
  booking record;
  details text;
  revision_before bigint;
begin
  insert into public.appointment_slots (doctor_id, start_at, end_at)
    values (target_doctor, starts - interval '15 minutes', starts + interval '15 minutes')
    returning id into manual_uuid;
  insert into public.appointment_slots (doctor_id, start_at, end_at)
    values (target_doctor, starts + interval '30 minutes', starts + interval '60 minutes')
    returning id into reusable_uuid;
  insert into public.doctor_registration_invites (token_hash, doctor_id, invited_email, expires_at)
    values (sha256(convert_to(invite_code, 'UTF8')), target_doctor, 'doctor-005@example.invalid', now() + interval '1 hour');

  begin
    perform public.complete_doctor_registration(patient_a, invite_code, intervals);
    raise exception 'Wrong invitation owner accepted';
  exception when sqlstate 'PT403' then null;
  end;
  begin
    perform public.complete_doctor_registration(doctor_user, invite_code, intervals || intervals);
    raise exception 'Overlapping intervals accepted';
  exception when sqlstate 'PT422' then null;
  end;
  perform public.complete_doctor_registration(doctor_user, invite_code, intervals);
  perform public.save_patient_profile(patient_a, 'Patient A', '0900000001');
  perform public.save_patient_profile(patient_b, 'Patient B', '0900000002');

  if (select is_published from public.appointment_slots where id = manual_uuid) then
    raise exception 'Overlapping manual slot was not retired';
  end if;
  if (select count(*) from public.list_doctor_availability(target_doctor, local_day, local_day)) <> 3 then
    raise exception 'Expected two morning slots and one afternoon slot';
  end if;
  if not exists (select 1 from public.list_doctor_availability(target_doctor, local_day, local_day) a
      where a.slot_id = reusable_uuid) then
    raise exception 'Matching manual slot UUID was not reused';
  end if;
  select a.slot_id into strict slot_uuid from public.list_doctor_availability(target_doctor, local_day, local_day) a
    where a.start_at = starts;
  if not exists (select 1 from public.list_doctor_availability(target_doctor, local_day, local_day) a
      where a.slot_id = slot_uuid and a.end_at - a.start_at = interval '30 minutes') then
    raise exception 'Refreshing lost the persisted slot UUID';
  end if;
  begin
    perform public.create_appointment(slot_uuid, 'Legacy Patient', '0900000000');
    raise exception 'Legacy API accepted a recurring slot';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    perform public.book_recurring_appointment(doctor_user, slot_uuid);
    raise exception 'Doctor booked as a patient';
  exception when sqlstate 'PT403' then null;
  end;

  select r.revision into strict revision_before from public.doctor_calendar_revisions r where r.doctor_id = target_doctor;
  alter table public.appointment_notifications add constraint force_test_notification_failure check (false) not valid;
  begin
    perform public.book_recurring_appointment(patient_a, slot_uuid);
    raise exception 'Booking succeeded without a persisted notification';
  exception when check_violation then
    get stacked diagnostics details = constraint_name;
    if details <> 'force_test_notification_failure' then raise; end if;
  end;
  alter table public.appointment_notifications drop constraint force_test_notification_failure;
  if exists (select 1 from public.appointments a where a.slot_id = slot_uuid)
    or (select r.revision from public.doctor_calendar_revisions r where r.doctor_id = target_doctor) <> revision_before then
    raise exception 'Notification failure left partial writes';
  end if;

  select * into strict booking from public.book_recurring_appointment(patient_a, slot_uuid);
  if booking.status <> 'confirmed' or booking.booking_reference is null
    or not exists (select 1 from public.appointments a where a.id = booking.appointment_id
      and a.slot_id = slot_uuid and a.patient_auth_user_id = patient_a)
    or not exists (select 1 from public.appointment_notifications n where n.appointment_id = booking.appointment_id
      and n.doctor_id = target_doctor) then
    raise exception 'Booking, slot FK or notification missing';
  end if;
  begin
    perform public.book_recurring_appointment(patient_b, slot_uuid);
    raise exception 'Second patient booked the same slot';
  exception when sqlstate 'PT409' then null;
  end;
  if exists (select 1 from public.list_doctor_availability(target_doctor, local_day, local_day) a where a.slot_id = slot_uuid) then
    raise exception 'Booked slot still available';
  end if;
  begin
    perform public.save_doctor_working_hours(doctor_user, local_day, jsonb_build_array(intervals->1));
    raise exception 'Schedule edit removed a confirmed appointment';
  exception when sqlstate 'PT409' then
    get stacked diagnostics details = pg_exception_detail;
    if details::jsonb->0->>'appointmentId' is distinct from booking.appointment_id::text then raise; end if;
  end;
  if exists (select 1 from public.doctor_schedule_versions v
      where v.doctor_id = target_doctor and v.effective_from = local_day) then
    raise exception 'Conflicting schedule version was persisted';
  end if;

  perform public.update_recurring_appointment_status(doctor_user, booking.appointment_id, 'cancelled');
  perform public.save_doctor_working_hours(doctor_user, local_day, jsonb_build_array(intervals->1));
  if exists (select 1 from public.appointment_slots s where s.id = slot_uuid and s.is_published)
    or not exists (select 1 from public.appointments a where a.id = booking.appointment_id
      and a.slot_id = slot_uuid and a.status = 'cancelled') then
    raise exception 'Schedule edit kept a stale slot or lost its appointment history';
  end if;
  begin
    perform public.book_recurring_appointment(patient_b, slot_uuid);
    raise exception 'An old slot UUID bypassed the new effective schedule';
  exception when sqlstate 'PT409' then null;
  end;
end;
$test$;

rollback;
