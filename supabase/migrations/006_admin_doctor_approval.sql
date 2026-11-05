-- Migration 006: isolated Admin approval queue. Apply AFTER 005, on a backed-up DB.
-- Existing doctor invitation registration is intentionally unchanged.
begin;
create table if not exists public.admin_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.doctor_applications (
 id uuid primary key default gen_random_uuid(),
 full_name text not null check (char_length(full_name) between 2 and 100),
 email text not null,
 specialty text not null,
 license_number text not null,
 hospital text not null,
 experience_years integer not null check (experience_years between 0 and 80),
 bio text not null default '',
 documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),
 submitted_at timestamptz not null default now(),
 status text not null default 'pending' check (status in ('pending','approved','rejected')),
 reviewed_by uuid references public.admin_accounts(user_id) on delete set null,
 reviewed_at timestamptz,
 review_note text,
 constraint review_state_consistent check (
   (status = 'pending' and reviewed_at is null and reviewed_by is null)
   or (status <> 'pending' and reviewed_at is not null and reviewed_by is not null)
 )
);
create index if not exists idx_doctor_applications_status_submitted
 on public.doctor_applications(status,submitted_at desc);
alter table public.admin_accounts enable row level security;
alter table public.doctor_applications enable row level security;
revoke all on public.admin_accounts from anon,authenticated;
revoke all on public.doctor_applications from anon,authenticated;
-- Service role accesses both tables only AFTER server has verified the Auth identity.
create or replace function public.review_doctor_application(
 p_admin_user_id uuid,p_application_id uuid,p_decision text,p_reason text
) returns text language plpgsql security definer set search_path = '' as $$
declare updated_status text;
begin
 if not exists(select 1 from public.admin_accounts where user_id=p_admin_user_id) then
   raise exception 'Forbidden' using errcode='PT403';
 end if;
 if p_decision not in ('approved','rejected') or
    (p_decision='rejected' and nullif(btrim(coalesce(p_reason,'')),'') is null) then
   raise exception 'Invalid decision' using errcode='PT422';
 end if;
 update public.doctor_applications
 set status=p_decision, reviewed_by=p_admin_user_id,reviewed_at=now(),
     review_note=nullif(btrim(coalesce(p_reason,'')),'')
 where id=p_application_id and status='pending'
 returning status into updated_status;
 if updated_status is null then
   if exists(select 1 from public.doctor_applications where id=p_application_id) then
     raise exception 'Already reviewed' using errcode='PT409';
   end if;
   raise exception 'Not found' using errcode='PT404';
 end if;
 return updated_status;
end $$;
revoke all on function public.review_doctor_application(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_doctor_application(uuid,uuid,text,text) to service_role;
commit;
-- BOOTSTRAP ADMIN manually in Supabase SQL Editor after confirming the user UUID:
-- insert into public.admin_accounts(user_id) values ('<trusted-existing-auth-user-uuid>');
-- This migration does NOT create an Admin automatically, nor promote a Doctor to active.
