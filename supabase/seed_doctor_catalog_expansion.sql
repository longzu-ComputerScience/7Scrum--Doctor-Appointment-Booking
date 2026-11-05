-- Optional catalog fixture for the course project. Every added profile is fictional.
-- Use on a v2 database. This script only writes public.doctors.
begin;

-- Match both the known fixture ID and its original name. Preserve all slot,
-- appointment, and Auth links and leave manually edited profile names alone.
update public.doctors d
set name = f.display_name
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'BS. Nguyễn Minh An'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'BS. Trần Hoàng Mai'),
  ('10000000-0000-4000-8000-000000000003'::uuid, 'BS. Lê Quốc Bình')
) as f(id, display_name)
where d.id = f.id and d.name = f.display_name || ' (Demo)';

-- Rename only the original sample certificate titles. Keep their provenance.
update public.doctors d
set certificates = (
  select jsonb_agg(
    case when c.item->>'name' = f.title || ' (Demo)' and c.item->>'issuer' = 'Đơn vị minh họa'
      then jsonb_set(c.item, '{name}', to_jsonb(f.title))
      else c.item
    end order by c.position
  )
  from jsonb_array_elements(d.certificates) with ordinality as c(item, position)
)
from (values
  ('10000000-0000-4000-8000-000000000001'::uuid, 'Chứng chỉ da liễu'),
  ('10000000-0000-4000-8000-000000000002'::uuid, 'Chứng chỉ tim mạch')
) as f(id, title)
where d.id = f.id and exists (
  select 1 from jsonb_array_elements(d.certificates) as c(item)
  where c.item->>'name' = f.title || ' (Demo)' and c.item->>'issuer' = 'Đơn vị minh họa'
);

insert into public.doctors (id, name, specialty, bio, address, district)
values
  ('10000000-0000-4000-8000-000000000004', 'BS. Phạm Khánh Vy', 'Da liễu',
   'Hồ sơ minh họa cho luồng tìm kiếm chuyên khoa da liễu.', 'Địa điểm minh họa D, TP.HCM', 'Quận 3'),
  ('10000000-0000-4000-8000-000000000005', 'BS. Vũ Thiên Phúc', 'Da liễu',
   'Hồ sơ minh họa cho danh mục bác sĩ da liễu.', 'Địa điểm minh họa E, TP.HCM', 'Gò Vấp'),
  ('10000000-0000-4000-8000-000000000006', 'BS. Đỗ Ngọc Lam', 'Nội tổng quát',
   'Hồ sơ minh họa cho luồng tìm kiếm bác sĩ khám tổng quát.', 'Địa điểm minh họa F, TP.HCM', 'Phú Nhuận'),
  ('10000000-0000-4000-8000-000000000007', 'BS. Bùi Hải Khang', 'Nội tổng quát',
   'Hồ sơ minh họa cho danh mục bác sĩ nội tổng quát.', 'Địa điểm minh họa G, TP.HCM', 'Tân Bình'),
  ('10000000-0000-4000-8000-000000000008', 'BS. Hồ Thanh Vân', 'Tim mạch',
   'Hồ sơ minh họa cho danh mục bác sĩ tim mạch.', 'Địa điểm minh họa H, TP.HCM', 'Quận 10'),
  ('10000000-0000-4000-8000-000000000009', 'BS. Trịnh Gia Hân', 'Nhi khoa',
   'Hồ sơ minh họa cho danh mục bác sĩ nhi khoa.', 'Địa điểm minh họa I, TP.HCM', 'Quận 5'),
  ('10000000-0000-4000-8000-000000000010', 'BS. Cao Minh Đức', 'Nhi khoa',
   'Hồ sơ minh họa cho danh mục bác sĩ nhi khoa.', 'Địa điểm minh họa J, TP.HCM', 'Bình Tân'),
  ('10000000-0000-4000-8000-000000000011', 'BS. Võ Bảo Linh', 'Tai Mũi Họng',
   'Hồ sơ minh họa cho danh mục bác sĩ tai mũi họng.', 'Địa điểm minh họa K, TP.HCM', 'Tân Phú'),
  ('10000000-0000-4000-8000-000000000012', 'BS. Đặng Nhật Nam', 'Cơ Xương Khớp',
   'Hồ sơ minh họa cho danh mục bác sĩ cơ xương khớp.', 'Địa điểm minh họa L, TP.HCM', 'Quận 7')
on conflict (id) do nothing;

commit;
