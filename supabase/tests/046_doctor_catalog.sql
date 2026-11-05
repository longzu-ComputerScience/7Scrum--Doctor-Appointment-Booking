-- Run as the database owner on a disposable local v2 database with seed.sql.
-- The inactive test updates one fixture inside a transaction and rolls it back.
begin;

do $test$
declare
  dermatology_id constant uuid := '10000000-0000-4000-8000-000000000001';
  general_medicine_id constant uuid := '10000000-0000-4000-8000-000000000003';
  missing_specialty constant text := 'QA46 No Match';
begin
  if not exists (
    select 1 from public.doctors d where d.active and d.specialty = 'Da liễu' and d.id = dermatology_id
  ) then
    raise exception 'Da liễu must include the active Dermatology fixture';
  end if;

  if not exists (
    select 1 from public.doctors d where d.active and d.specialty = 'Nội tổng quát' and d.id = general_medicine_id
  ) then
    raise exception 'Nội tổng quát must include the active General Medicine fixture';
  end if;

  if exists (
    select 1 from public.doctors d
    where d.id in (dermatology_id, general_medicine_id)
      and (nullif(btrim(d.address), '') is null or nullif(btrim(d.district), '') is null)
  ) then
    raise exception 'MVP doctor fixtures must have an address and district';
  end if;

  if exists (select 1 from public.doctors d where d.active and d.specialty = missing_specialty) then
    raise exception 'The no-match specialty must return zero doctors';
  end if;

  update public.doctors set active = false where id = dermatology_id;
  if not exists (
    select 1 from public.doctors d where d.id = dermatology_id and not d.active and d.specialty = 'Da liễu'
  ) or exists (
    select 1 from public.doctors d where d.active and d.specialty = 'Da liễu' and d.id = dermatology_id
  ) then
    raise exception 'An inactive Dermatology doctor must stay in the catalog table but be excluded by the filter';
  end if;
  raise notice 'PASS: MVP specialty mappings, location fields, no match and inactive exclusion';
end;
$test$;

rollback;
