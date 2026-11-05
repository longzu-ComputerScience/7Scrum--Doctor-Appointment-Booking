# Bàn giao dữ liệu danh mục bác sĩ · US-01 / #46

Chatbot gợi ý chuyên khoa. Danh sách bác sĩ lấy các hồ sơ đang hoạt động từ `public.doctors`. Dùng ID do DB trả về để mở hồ sơ hoặc xem lịch. [Issue #46](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/46) · [Kịch bản nghiệm thu](../docs/ACCEPTANCE_SCENARIO.md)

## Mapping MVP và dữ liệu mẫu

| Tên chuyên khoa trong luồng US-01 | Giá trị `doctors.specialty` | ID mẫu | Kết quả mong đợi |
|---|---|---|---|
| Dermatology | `Da liễu` | `10000000-0000-4000-8000-000000000001` | Trả hồ sơ BS. Nguyễn Minh An (Demo) khi `active = true`. |
| General Medicine | `Nội tổng quát` | `10000000-0000-4000-8000-000000000003` | Trả hồ sơ BS. Lê Quốc Bình (Demo) khi `active = true`. |
| Ca kiểm tra không có dữ liệu | `QA46 No Match` | | DB trả 0 dòng. API đọc catalog dự kiến trả HTTP 200 với `doctors: []`. |

Đây là hồ sơ giả trong [seed v2](seed.sql) đã lưu vào bảng `doctors` trên DB dùng chung. Seed còn có một hồ sơ mẫu Tim mạch. Khi nghiệm thu đường đọc DB, kiểm tra API trả `demoMode: false` và ID khớp với truy vấn. `DEMO_DOCTORS` trong FastAPI là dữ liệu dự phòng khi thiếu cấu hình DB.

## Audit chỉ đọc

Kết quả ghi nhận ngày 05/11/2026 trên Supabase dùng chung. Có 3 bác sĩ `active` khớp ID seed, mỗi người thuộc một trong ba chuyên khoa trên. Cả ba có `specialty`, `address` và `district`. Tại thời điểm audit, bảng chưa có bác sĩ `inactive`.

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

Kết quả cục bộ với PGlite ngày 05/11/2026. Chạy hai lần trên bản `001` + seed và hai lần trên bản `001–005` + seed. Các ca đều qua và dữ liệu trong `doctors`, `appointment_slots` và `appointments` khớp trước và sau mỗi lần chạy.
