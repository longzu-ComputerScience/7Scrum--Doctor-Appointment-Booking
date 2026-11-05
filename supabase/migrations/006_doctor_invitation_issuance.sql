-- Admin-only invitation issuance. Existing doctor profiles and data are preserved.
begin;

create function public.issue_doctor_registration_invite(
  p_doctor_id uuid, p_email text, p_token_hash bytea, p_expires_at timestamptz
)
returns timestamptz
language plpgsql security definer set search_path = pg_catalog as $body$
declare
  normalized_email text := lower(btrim(p_email));
begin
  if normalized_email is null or char_length(normalized_email) not between 3 and 320
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_token_hash is null or octet_length(p_token_hash) <> 32
    or p_expires_at is null or not isfinite(p_expires_at)
    or p_expires_at <= clock_timestamp() or p_expires_at > clock_timestamp() + interval '30 days' then
    raise exception 'Invalid invitation details' using errcode = 'PT422';
  end if;

  perform 1 from public.doctors d where d.id = p_doctor_id and d.active for update;
  if not found then
    raise exception 'Active doctor profile not found' using errcode = 'PT404';
  end if;
  if exists (select 1 from public.doctor_accounts a where a.doctor_id = p_doctor_id)
    or exists (select 1 from auth.users u where lower(btrim(u.email)) = normalized_email) then
    raise exception 'Doctor or email already has an account' using errcode = 'PT409';
  end if;

  -- Reissuing an invitation revokes all older unused invitations for this doctor.
  update public.doctor_registration_invites i set expires_at = clock_timestamp()
    where i.doctor_id = p_doctor_id and i.consumed_at is null and i.expires_at > clock_timestamp();
  insert into public.doctor_registration_invites (doctor_id, invited_email, token_hash, expires_at)
    values (p_doctor_id, normalized_email, p_token_hash, p_expires_at);
  return p_expires_at;
end;
$body$;

revoke all on function public.issue_doctor_registration_invite(uuid, text, bytea, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_doctor_registration_invite(uuid, text, bytea, timestamptz) to service_role;

commit;
