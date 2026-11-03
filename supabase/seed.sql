-- Fictional sample catalog (NOT real medical provider details).
insert into public.clinics(id,name,address,district) values
('20000000-0000-4000-8000-000000000001','Phòng khám Mẫu A','Thủ Đức, TP.HCM (demo address)','Thủ Đức'),
('20000000-0000-4000-8000-000000000002','Phòng khám Mẫu B','Bình Thạnh, TP.HCM (demo address)','Bình Thạnh')
on conflict(id) do nothing;

insert into public.doctors(id,name,specialty,bio,clinic_id) values
('10000000-0000-4000-8000-000000000001','BS. Nguyễn Minh An (Demo)','Da liễu','Khám và tư vấn các vấn đề về da.','20000000-0000-4000-8000-000000000001'),
('10000000-0000-4000-8000-000000000002','BS. Trần Hoàng Mai (Demo)','Tim mạch','Tư vấn và thăm khám các vấn đề tim mạch.','20000000-0000-4000-8000-000000000002'),
('10000000-0000-4000-8000-000000000003','BS. Lê Quốc Bình (Demo)','Nội tổng quát','Khám sức khỏe tổng quát.','20000000-0000-4000-8000-000000000001')
on conflict(id) do nothing;

insert into public.rooms(id, clinic_id, name) values
('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Room A1'),
('40000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000001','Room A2'),
('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','Room B1')
on conflict(id) do nothing;

-- Upcoming slots in Vietnam timezone. Re-run daily if you need fresh sample slots.
insert into public.appointment_slots(doctor_id,clinic_id,room_id,start_at,end_at)
select d.id,d.clinic_id,
       case when d.id = '10000000-0000-4000-8000-000000000003'::uuid
            then '40000000-0000-4000-8000-000000000003'::uuid
            when d.clinic_id = '20000000-0000-4000-8000-000000000001'::uuid
            then '40000000-0000-4000-8000-000000000001'::uuid
            else '40000000-0000-4000-8000-000000000002'::uuid end,
       ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + make_interval(days => day_offset, hours => hour_of_day)) at time zone 'Asia/Ho_Chi_Minh'),
       ((date_trunc('day', now() at time zone 'Asia/Ho_Chi_Minh') + make_interval(days => day_offset, hours => hour_of_day, mins => 30)) at time zone 'Asia/Ho_Chi_Minh')
from public.doctors d
cross join generate_series(1, 5) as day_offset
cross join (values (9),(10),(14)) h(hour_of_day)
where d.id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003')
on conflict(doctor_id,start_at) do nothing;

-- Staff setup AFTER creating a test user via Supabase Auth UI:
-- insert into public.staff_members (user_id,clinic_id)
-- values ('<auth-user-id>', '20000000-0000-4000-8000-000000000001');
