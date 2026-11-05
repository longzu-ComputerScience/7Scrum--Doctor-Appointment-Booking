-- Shared test only. Use two synthetic Auth accounts created in Supabase Auth.
-- Replace both NULL variables with their verified Auth UUIDs before running.
-- The Doctor must be intended to own the existing BS. Nguyễn Minh An profile.
-- Schedule RPCs automatically persist generated 30-minute slots.
begin;

do $seed$
declare
  demo_doctor_user uuid := null;
  demo_patient_user uuid := null;
  demo_doctor_id constant uuid := '10000000-0000-4000-8000-000000000001';
  doctor_email text;
  linked_doctor uuid;
  demo_code text;
  working_hours jsonb;
  today date := (clock_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if demo_doctor_user is null or demo_patient_user is null or demo_doctor_user = demo_patient_user then
    raise exception 'Set two distinct synthetic Auth UUIDs for the test project';
  end if;
  select u.email into doctor_email from auth.users u where u.id = demo_doctor_user;
  if doctor_email is null or not exists (select 1 from auth.users u where u.id = demo_patient_user) then
    raise exception 'Create both test users in Supabase Auth first';
  end if;

  select jsonb_agg(jsonb_build_object('weekday', day_number, 'startMinute', starts, 'endMinute', ends)
      order by day_number, starts)
    into working_hours
  from generate_series(1, 5) as weekday(day_number)
  cross join (values (540, 720), (780, 1020)) as hours(starts, ends);

  select a.doctor_id into linked_doctor from public.doctor_accounts a where a.auth_user_id = demo_doctor_user;
  if linked_doctor is null then
    demo_code := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    insert into public.doctor_registration_invites (token_hash, doctor_id, invited_email, expires_at)
      values (sha256(convert_to(demo_code, 'UTF8')), demo_doctor_id, doctor_email, now() + interval '10 minutes');
    perform public.complete_doctor_registration(demo_doctor_user, demo_code, working_hours);
  elsif linked_doctor <> demo_doctor_id then
    raise exception 'Test Auth user is linked to a different doctor';
  elsif not exists (select 1 from public.doctor_schedule_versions v where v.doctor_id = demo_doctor_id) then
    perform public.save_doctor_working_hours(demo_doctor_user, today, working_hours);
  end if;

  perform public.save_patient_profile(demo_patient_user, 'Bệnh nhân minh họa US-03', '0900000000');
end;
$seed$;

commit;
