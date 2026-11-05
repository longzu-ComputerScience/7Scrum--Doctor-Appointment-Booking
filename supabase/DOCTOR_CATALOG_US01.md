# Bàn giao dữ liệu danh mục bác sĩ · US-01 / #46

Chatbot gợi ý chuyên khoa. Danh sách bác sĩ lấy các hồ sơ đang hoạt động từ `public.doctors`. Dùng ID do DB trả về để mở hồ sơ hoặc xem lịch. [Issue #46](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/46) · [Kịch bản nghiệm thu](../docs/ACCEPTANCE_SCENARIO.md)

## Mapping MVP và dữ liệu mẫu

| Tên chuyên khoa trong luồng US-01 | Giá trị `doctors.specialty` | ID mẫu | Kết quả mong đợi |
|---|---|---|---|
| Dermatology | `Da liễu` | `10000000-0000-4000-8000-000000000001` | Có hồ sơ BS. Nguyễn Minh An trong kết quả khi `active = true`. |
| General Medicine | `Nội tổng quát` | `10000000-0000-4000-8000-000000000003` | Có hồ sơ BS. Lê Quốc Bình trong kết quả khi `active = true`. |
| Ca kiểm tra không có dữ liệu | `QA46 No Match` | | DB trả 0 dòng. API đọc catalog dự kiến trả HTTP 200 với `doctors: []`. |

Đây là hồ sơ mẫu của đồ án, đã lưu vào bảng `doctors` trên Supabase chính. [Seed v2](seed.sql) tạo ba hồ sơ ban đầu. [Seed mở rộng catalog](seed_doctor_catalog_expansion.sql) bỏ hậu tố `(Demo)` khỏi tên hiển thị và thêm hồ sơ mẫu vào danh mục. Seed mở rộng chạy lại được, giữ UUID cũ và chỉ ghi vào `doctors`. Khi nghiệm thu đường đọc DB, kiểm tra API trả `demoMode: false` và ID khớp với truy vấn. `DEMO_DOCTORS` trong FastAPI là dữ liệu dự phòng khi thiếu cấu hình DB.

## Audit chỉ đọc

Audit ban đầu ngày 05/11/2026 trên Supabase chính ghi nhận 3 bác sĩ `active` khớp ID seed, thuộc Da liễu, Nội tổng quát và Tim mạch. Cả ba có `specialty`, `address` và `district`. Tại thời điểm audit, bảng chưa có bác sĩ `inactive`.

Sau khi mở rộng catalog, truy vấn trên Supabase chính xác nhận 12 hồ sơ `active` thuộc 6 chuyên khoa. Danh mục gồm 3 Da liễu, 3 Nội tổng quát, 2 Tim mạch, 2 Nhi khoa, 1 Tai Mũi Họng và 1 Cơ Xương Khớp. Tên bác sĩ và tên chứng chỉ mẫu đã bỏ hậu tố `(Demo)`. Số lượng slot, lịch hẹn và liên kết tài khoản bác sĩ trước và sau cập nhật lần lượt vẫn là 47, 8 và 1.

Truy vấn để đối chiếu lại số lượng và ID theo chuyên khoa:

```sql
select
  specialty,
  count(*) filter (where active) as active_count,
  count(*) filter (where not active) as inactive_count,
  count(*) filter (
    where nullif(btrim(specialty), '') is null
       or nullif(btrim(address), '') is null
       or nullif(btrim(district), '') is null
  ) as incomplete_count,
  array_agg(id order by id) filter (where active) as active_ids
from public.doctors
group by specialty
order by specialty;
```

## Kiểm tra cục bộ và bàn giao

1. Trên PostgreSQL cục bộ dùng một lần, chuẩn bị schema Auth tương thích Supabase, chạy [`001_init.sql`](migrations/001_init.sql) và [`seed.sql`](seed.sql). Dùng chính bộ seed này cho ca tái lập.
2. Chạy [`tests/046_doctor_catalog.sql`](tests/046_doctor_catalog.sql) với chế độ dừng khi lỗi, ví dụ `psql -v ON_ERROR_STOP=1 -f supabase/tests/046_doctor_catalog.sql` khi kết nối đến DB cục bộ. Script kiểm tra hai mapping MVP, địa chỉ/quận, ca 0 dòng và việc loại bác sĩ inactive. Ca inactive tạm đổi trạng thái một fixture rồi rollback.
3. BE2 và Tester đối chiếu luồng Dermatology với đúng ID từ bảng trên. Kiểm tra riêng kết quả API khi DB trả 0 dòng và khi hồ sơ trùng chuyên khoa đang inactive. Bằng chứng SQL xác nhận dữ liệu và bộ lọc ở DB. Kiểm thử HTTP và giao diện xác nhận cách ứng dụng sử dụng dữ liệu đó.

Kết quả cục bộ với PGlite ngày 05/11/2026. Test qua trên seed ban đầu và seed mở rộng. Chạy lại seed mở rộng giữ nguyên 12 hồ sơ thuộc 6 chuyên khoa. Test lọc theo UUID bác sĩ mẫu, nên vẫn chạy được khi một chuyên khoa có nhiều bác sĩ. Đối chiếu cục bộ xác nhận các slot, lịch hẹn và liên kết Auth vẫn giữ nguyên sau khi mở rộng catalog.
