-- Additive profile media and a real doctor-application queue.
-- Run after migrations 007_doctor_profile_registration and 008_admin_doctor_approval.
-- Existing doctors/appointments remain untouched. Do not apply on Production before review/backup.
begin;

alter table public.patient_profiles add column if not exists avatar_path text;
alter table public.doctors add column if not exists avatar_path text;

-- Only the FastAPI service role can upload files. No browser upload/read policy.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-avatars', 'profile-avatars', false, 2097152,
    array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

alter table public.doctor_applications
  add column if not exists doctor_id uuid unique references public.doctors(id) on delete restrict;
alter table public.doctor_applications alter column experience_years drop not null;

-- When a doctor signs up through the CURRENT certificate-registration RPC,
-- doctor_registration_details already exists before doctor_accounts is inserted.
-- The trigger runs in that registration transaction: no unreviewed doctor becomes active.
create or replace function public.queue_registered_doctor_for_approval()
returns trigger language plpgsql security definer set search_path = pg_catalog as $body$
declare
  doc public.doctors%rowtype;
  details public.doctor_registration_details%rowtype;
  registered_email text;
begin
  select * into details from public.doctor_registration_details
    where doctor_id = new.doctor_id;
  if not found then
    -- Existing doctor invitation accounts are not part of this self-application flow.
    return new;
  end if;
  select * into doc from public.doctors where id = new.doctor_id for update;
  select email into registered_email from auth.users where id = new.auth_user_id;
  if registered_email is null then
    raise exception 'Doctor email unavailable' using errcode='PT422';
  end if;
  update public.doctors set active = false where id = new.doctor_id;
  insert into public.doctor_applications (
    doctor_id, full_name, email, specialty, license_number, hospital,
    experience_years, bio, documents
  ) values (
    new.doctor_id, doc.name, registered_email, doc.specialty,
    details.certificate_number, doc.address, null, doc.bio,
    jsonb_build_array(details.document_path)
  );
  return new;
end;
$body$;

drop trigger if exists trg_enqueue_doctor_application on public.doctor_accounts;
create trigger trg_enqueue_doctor_application
  after insert on public.doctor_accounts for each row
  execute function public.queue_registered_doctor_for_approval();

-- Review is atomic and authorizes the new doctor's public catalog visibility.
-- Existing manually-created application rows with no doctor_id only record a decision.
create or replace function public.review_doctor_application(
  p_admin_user_id uuid,p_application_id uuid,p_decision text,p_reason text
) returns text language plpgsql security definer set search_path = pg_catalog as $body$
declare target public.doctor_applications%rowtype;
begin
  if not exists(select 1 from public.admin_accounts where user_id=p_admin_user_id) then
    raise exception 'Forbidden' using errcode='PT403';
  end if;
  if p_decision not in ('approved','rejected') or
    (p_decision='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null) then
    raise exception 'Invalid decision' using errcode='PT422';
  end if;

  select * into target from public.doctor_applications
    where id=p_application_id for update;
  if not found then raise exception 'Not found' using errcode='PT404'; end if;
  if target.status <> 'pending' then
    raise exception 'Already reviewed' using errcode='PT409';
  end if;
  if p_decision='approved' and target.doctor_id is not null then
    update public.doctors set active=true where id=target.doctor_id;
    if not found then raise exception 'Doctor missing' using errcode='PT404'; end if;
  end if;
  update public.doctor_applications
    set status=p_decision, reviewed_by=p_admin_user_id,
        reviewed_at=now(), review_note=nullif(btrim(coalesce(p_reason,'')),'')
    where id=p_application_id;
  return p_decision;
end;
$body$;
revoke all on function public.review_doctor_application(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.review_doctor_application(uuid,uuid,text,text) to service_role;

commit;
