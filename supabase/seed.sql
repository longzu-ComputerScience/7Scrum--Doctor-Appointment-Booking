-- Fictional fixtures for the v2 schema. Run as database owner after 001_init.sql.
begin;

insert into public.doctors (
  id, name, specialty, bio, address, district, certificates, rating, rating_count
) values
  ('10000000-0000-4000-8000-000000000001', 'BS. Nguyễn Minh An (Demo)', 'Da liễu',
   'Hồ sơ giả dùng để kiểm thử tìm kiếm và đặt lịch.', 'Địa chỉ minh họa A, TP.HCM', 'Thủ Đức',
   '[{"name":"Chứng chỉ da liễu (Demo)","issuer":"Đơn vị minh họa","issuedYear":2024,"credentialUrl":null}]'::jsonb,
   4.50, 2),
  ('10000000-0000-4000-8000-000000000002', 'BS. Trần Hoàng Mai (Demo)', 'Tim mạch',
   'Hồ sơ giả dùng để kiểm thử tìm kiếm và đặt lịch.', 'Địa chỉ minh họa B, TP.HCM', 'Bình Thạnh',
   '[{"name":"Chứng chỉ tim mạch (Demo)","issuer":"Đơn vị minh họa","issuedYear":null,"credentialUrl":null}]'::jsonb,
   null, 0),
  ('10000000-0000-4000-8000-000000000003', 'BS. Lê Quốc Bình (Demo)', 'Nội tổng quát',
   'Hồ sơ giả dùng để kiểm thử trường hợp chưa có chứng chỉ và đánh giá.', 'Địa chỉ minh họa C, TP.HCM', 'Thủ Đức',
   '[]'::jsonb, null, 0)
on conflict (id) do nothing;

-- Rating 4.50/2 is synthetic (two sample scores of 4 and 5).
-- Generate 30-minute slots at 09:00, 10:00 and 14:00 for the next five local days.
with candidate_slots as (
  select d.id as doctor_id,
    (date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh')
      + make_interval(days => day_number, hours => hour_number))
      at time zone 'Asia/Ho_Chi_Minh' as start_at
  from public.doctors d
  cross join generate_series(1, 5) as days(day_number)
  cross join (values (9), (10), (14)) as hours(hour_number)
  where d.active and d.id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003'
  )
)
insert into public.appointment_slots (doctor_id, start_at, end_at)
select doctor_id, start_at, start_at + interval '30 minutes'
from candidate_slots
-- Skip duplicate starts and overlaps with availability already entered.
on conflict do nothing;

commit;

-- Create a fictitious staff account in Supabase Authentication first.
-- Replace <auth-user-id> with the actual user UUID and run this separately.
-- insert into public.staff_members (user_id, doctor_id)
-- values ('<auth-user-id>', '10000000-0000-4000-8000-000000000001')
-- on conflict (user_id, doctor_id) do nothing;
