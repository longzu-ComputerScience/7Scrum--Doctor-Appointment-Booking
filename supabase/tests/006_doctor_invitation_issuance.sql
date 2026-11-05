-- Run after 005 and 006 as the database owner. All test data is rolled back.
begin;
do $test$
declare
  test_doctor_id uuid;
  email text := 'invite-test-' || gen_random_uuid()::text || '@example.invalid';
  first_hash bytea := sha256(convert_to(gen_random_uuid()::text, 'UTF8'));
  second_hash bytea := sha256(convert_to(gen_random_uuid()::text, 'UTF8'));
begin
  if has_function_privilege('anon', 'public.issue_doctor_registration_invite(uuid,text,bytea,timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.issue_doctor_registration_invite(uuid,text,bytea,timestamptz)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.issue_doctor_registration_invite(uuid,text,bytea,timestamptz)', 'EXECUTE') then
    raise exception 'Invitation issuance must be backend-only';
  end if;
  insert into public.doctors (name, specialty, address, district)
    values ('Auth Integration SQL Test', 'Test', 'Synthetic test address', 'Test') returning id into test_doctor_id;
  perform public.issue_doctor_registration_invite(test_doctor_id, '  ' || upper(email) || '  ', first_hash,
    clock_timestamp() + interval '1 hour');
  if not exists (select 1 from public.doctor_registration_invites i
    where i.token_hash=first_hash and i.doctor_id=test_doctor_id and i.invited_email=email) then
    raise exception 'Invitation did not persist the normalized email and hash';
  end if;
  perform public.issue_doctor_registration_invite(test_doctor_id, email, second_hash,
    clock_timestamp() + interval '1 hour');
  if exists (select 1 from public.doctor_registration_invites i
    where i.token_hash=first_hash and i.expires_at > clock_timestamp()) then
    raise exception 'Reissuing must expire the previous invitation';
  end if;
  begin
    perform public.issue_doctor_registration_invite(test_doctor_id, email, first_hash, clock_timestamp() - interval '1 second');
    raise exception 'Expected expired invitation refusal';
  exception when sqlstate 'PT422' then null;
  end;
  begin
    perform public.issue_doctor_registration_invite(test_doctor_id, email, first_hash, clock_timestamp() + interval '31 days');
    raise exception 'Expected maximum expiry refusal';
  exception when sqlstate 'PT422' then null;
  end;
  begin
    perform public.issue_doctor_registration_invite(test_doctor_id, 'bad-email', first_hash, clock_timestamp() + interval '1 hour');
    raise exception 'Expected invalid email refusal';
  exception when sqlstate 'PT422' then null;
  end;
  update public.doctors d set active=false where d.id=test_doctor_id;
  begin
    perform public.issue_doctor_registration_invite(test_doctor_id, email, first_hash, clock_timestamp() + interval '1 hour');
    raise exception 'Expected inactive doctor refusal';
  exception when sqlstate 'PT404' then null;
  end;
end;
$test$;
rollback;
