-- Doctor self-registration: personal details + a private practice certificate.
-- Additive migration; existing doctors, invitations and schedules are preserved.
begin;

create table public.doctor_registration_details (
  doctor_id uuid primary key references public.doctors(id) on delete cascade,
  phone text not null check (phone collate "C" ~ '^[+]?[0-9 ()-]{9,20}$'
    and char_length(regexp_replace(phone collate "C", '[^0-9]', '', 'g')) >= 9),
  certificate_number text not null check (char_length(btrim(certificate_number)) between 1 and 200),
  document_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.doctor_registration_details enable row level security;
revoke all on table public.doctor_registration_details from public, anon, authenticated, service_role;
grant select on table public.doctor_registration_details to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doctor-certificates', 'doctor-certificates', false, 10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);
-- No client Storage policy: uploads and reads use backend service credentials.

create function public.register_doctor_profile(
  p_user_id uuid, p_name text, p_phone text, p_address text, p_specialty text,
  p_certificate_name text, p_certificate_issuer text, p_certificate_number text, p_document_path text
)
returns uuid language plpgsql security definer set search_path = pg_catalog as $body$
declare
  new_doctor_id uuid;
begin
  perform 1 from auth.users u where u.id = p_user_id and u.email is not null for update;
  if not found then
    raise exception 'Auth account not found' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.patient_profiles p where p.auth_user_id = p_user_id)
    or exists (select 1 from public.doctor_accounts a where a.auth_user_id = p_user_id) then
    raise exception 'Account already has a role' using errcode = 'PT409';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 2 and 100
    or p_phone is null or p_phone collate "C" !~ '^[+]?[0-9 ()-]{9,20}$'
    or char_length(regexp_replace(p_phone collate "C", '[^0-9]', '', 'g')) < 9
    or p_address is null or char_length(btrim(p_address)) not between 1 and 200
    or p_specialty is null or char_length(btrim(p_specialty)) not between 1 and 80
    or p_certificate_name is null or char_length(btrim(p_certificate_name)) not between 1 and 200
    or p_certificate_issuer is null or char_length(btrim(p_certificate_issuer)) not between 1 and 200
    or p_certificate_number is null or char_length(btrim(p_certificate_number)) not between 1 and 200 then
    raise exception 'Invalid doctor details' using errcode = 'PT422';
  end if;
  if p_document_path is null
    or p_document_path not in (p_user_id::text || '/certificate.pdf', p_user_id::text || '/certificate.png',
      p_user_id::text || '/certificate.jpg', p_user_id::text || '/certificate.webp')
    or not exists (select 1 from storage.objects o
      where o.bucket_id = 'doctor-certificates' and o.name = p_document_path) then
    raise exception 'Certificate document not found' using errcode = 'PT422';
  end if;

  insert into public.doctors (name, specialty, address, district, certificates)
  values (btrim(p_name), btrim(p_specialty), btrim(p_address), 'Chưa cập nhật',
    jsonb_build_array(jsonb_build_object('name', btrim(p_certificate_name), 'issuer', btrim(p_certificate_issuer))))
  returning id into new_doctor_id;
  insert into public.doctor_registration_details (doctor_id, phone, certificate_number, document_path)
  values (new_doctor_id, btrim(p_phone), btrim(p_certificate_number), p_document_path);
  insert into public.doctor_accounts (auth_user_id, doctor_id) values (p_user_id, new_doctor_id);
  -- The first weekly schedule is created through the existing dashboard API.
  return new_doctor_id;
end;
$body$;

revoke all on function public.register_doctor_profile(uuid, text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.register_doctor_profile(uuid, text, text, text, text, text, text, text, text)
  to service_role;

commit;
