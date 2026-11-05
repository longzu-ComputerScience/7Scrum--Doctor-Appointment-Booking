# Bàn giao SQL US-03 · Issue #31

Bản để BE2 và Lead review. Phạm vi gồm migration tạo slot, quyền nhân viên và cách xác minh DB. Staff HTTP API thuộc [BE2 #32](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/32). [Lead #36](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/36) chốt hợp đồng tích hợp và phối hợp [Tester #35](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/35).

## Hiện trạng kiểm tra ngày 04/11/2026

- `main` đã có SQL v2 từ PR #29. Code backend còn truy vấn `clinic_id` và ghi slot trực tiếp. Hai thao tác này cần được thay bằng phân quyền theo doctor và gọi RPC trong #32.
- Đọc qua MCP trên Supabase test `jlvdqrfnntxpbgomugdu`: **4 bảng, 29 cột, RLS bật trên cả bốn**, 3 bác sĩ và 45 slot tương lai đã công bố. Có một lịch `requested`, một lịch `cancelled`, 0 Auth user và 0 membership tại lúc kiểm tra.
- Supabase test đã có GiST `appointment_slots_no_overlap` và các RPC đặt lịch, đổi trạng thái. `service_role` không có quyền `INSERT` trực tiếp vào `appointment_slots`. Chưa thấy `create_staff_slot`.
- Lịch sử migration trả về rỗng vì schema hiện hành được tạo qua SQL Editor. Không suy ra database đang trống từ lịch sử rỗng.

## Hợp đồng RPC đề xuất cho #32

| Tham số SQL | Kiểu | Nguồn |
|---|---|---|
| `p_user_id` | `uuid` | ID do backend lấy từ JWT staff đã xác thực |
| `p_doctor_id` | `uuid` | Body `doctorId` |
| `p_start_at` | `timestamptz` | Body `startAt`, có offset hoặc `Z` |
| `p_end_at` | `timestamptz` | Body `endAt`, có offset hoặc `Z` |

Gọi `public.create_staff_slot` với bốn tham số trên bằng client `service_role` ở backend. Backend xác thực token và kiểm tra định dạng timestamp trước khi gọi. PostgreSQL nhận thời điểm đã parse nên bản thân RPC không thể xác minh chuỗi ban đầu có offset hay không. Trình duyệt gửi JWT đến FastAPI, không gửi `p_user_id` hoặc gọi RPC bằng `service_role`.

RPC trả một dòng `id`, `doctor_id`, `start_at`, `end_at`, `is_published`. API có thể map sang `id`, `doctorId`, `startAt`, `endAt`, `isPublished` và trả `201`. Tên wrapper JSON và kiểu response chính thức do #32 chốt. Slot mới lưu với `is_published = true`. Sau khi lưu, API đọc slot của bệnh nhân phải đọc cùng bảng và áp dụng điều kiện bác sĩ active, slot công bố, còn tương lai và chưa có lịch chưa hủy.

| Tình huống | Mã RPC | HTTP đề xuất |
|---|---|---|
| JWT thiếu, sai hoặc hết hạn | BE xử lý trước RPC | `401` |
| User không được gán bác sĩ, bác sĩ không tồn tại, hoặc thiếu `p_user_id` | `PT403` | `403` |
| UUID/timestamp sai định dạng | BE validation trước RPC | `422` |
| Thiếu tham số slot, timestamp không hữu hạn, slot đã qua, quá 30 ngày hoặc thời lượng ngoài 15–120 phút | `PT422` | `422` |
| Bác sĩ đã ngừng nhận slot, trùng giờ bắt đầu hoặc giao với một slot của cùng bác sĩ | `PT409` | `409` |
| Supabase không truy cập được hoặc lỗi hạ tầng | BE xử lý | `503` |

RPC giữ khóa doctor đến cuối giao dịch, kiểm tra và khóa membership trước ghi. DB dùng `clock_timestamp()` sau khi lấy khóa. Hạn 30 ngày tính bằng 720 giờ từ thời điểm kiểm tra. Khoảng slot theo `[start, end)`, nên hai slot liền kề được phép. Mỗi bác sĩ có thể có slot cùng giờ với bác sĩ khác. Quyền ghi trực tiếp trên bảng giữ nguyên. GiST và unique hiện có là lớp bảo vệ cuối khi tạo trùng.

Luồng đặt lịch giữ nguyên v2. `create_appointment` tạo `requested` và giữ slot ngay. Khi staff được phân quyền gọi `update_appointment_status` với `p_expected_status = 'requested'` và `p_status = 'confirmed'`, slot vẫn bị chiếm và dashboard có thể hiện lịch đã xác nhận. Thông tin bệnh nhân chỉ xuất hiện trên API staff đúng quyền. Các RPC đặt lịch và đổi trạng thái giữ chữ ký trong [Data Dictionary](../docs/DATA_DICTIONARY.md#7-giao-dịch-đặt-lịch-cập-nhật-và-bất-biến).

## Áp dụng và chuẩn bị dữ liệu demo

1. **Project test đang ở v2.** Sau review, chạy riêng [003_staff_create_slot_v2.sql](migrations/003_staff_create_slot_v2.sql) qua SQL Editor. Ghi lại project, commit và thời điểm thực thi. Dùng `to_regprocedure('public.create_staff_slot(uuid,uuid,timestamptz,timestamptz)')` để kiểm tra hàm sau khi áp dụng. File `001_init.sql` dành cho database mới.
2. **Project Supabase mới.** Chạy `001_init.sql`, `002_po_mvp_schedule.sql`, `003_staff_create_slot_v2.sql`, rồi `seed.sql`. `002` bỏ qua schema v2.
3. **Tài khoản demo.** Tạo hai user giả trong Supabase Auth. Gán staff A cho BS. Nguyễn Minh An có ID `10000000-0000-4000-8000-000000000001`, staff B cho BS. Trần Hoàng Mai có ID `10000000-0000-4000-8000-000000000002`. Dùng UUID Auth thật của từng tài khoản giả. Giữ mật khẩu test trong kênh quản lý secrets của nhóm.

```sql
-- SQL Editor trên project test. Thay hai UUID Auth trước khi chạy.
insert into public.staff_members (user_id, doctor_id)
values
  ('<uuid-auth-staff-a>'::uuid, '10000000-0000-4000-8000-000000000001'),
  ('<uuid-auth-staff-b>'::uuid, '10000000-0000-4000-8000-000000000002')
on conflict (user_id, doctor_id) do nothing;
```

## Kế hoạch riêng nếu có môi trường V1 đang chứa dữ liệu

`003` chỉ chạy khi schema đã ở v2. Chưa xác định được project v1 nào cần chuyển trong lượt audit này. Khi Lead xác nhận một môi trường v1 cần chuyển, dùng [Data Dictionary mục 9](../docs/DATA_DICTIONARY.md#9-chuyển-v1--v2-không-mất-dữ-liệuquyền) và chuẩn bị migration chuyển đổi riêng trên bản sao đã backup:

1. Chụp schema và dữ liệu. Đối soát doctor, slot, appointment, membership và các bản ghi bị lệch clinic. Rà khung giờ giao nhau và dữ liệu không đạt CHECK v2 trước khi đổi khóa.
2. Chuyển `address`, `district` và điều kiện active từ clinic sang doctor. Chuyển quyền `user_id + clinic_id` thành danh sách `user_id + doctor_id`, loại cặp trùng. Giữ nguyên doctor ID, slot ID, appointment ID, trạng thái, mã tham chiếu và timestamp hiện có.
3. Đối soát ID và quyền trước khi gỡ cột, FK hoặc bảng cũ. Áp schema v2 và `003` trên bản sao, kiểm thử luồng tạo slot và booking trước khi cutover. Lead phối hợp đổi backend và kiểm soát ghi trong thời gian chuyển.
4. Ghi kế hoạch rollback và xử lý dữ liệu phát sinh sau cutover. Với project đã chạy SQL Editor, chỉ chuyển sang `supabase db push` sau khi đối chiếu schema với file và thống nhất cách ghi nhận lịch sử.

## Bằng chứng kiểm thử cục bộ

Đã chạy trên PostgreSQL 18.6 nhúng với dữ liệu giả và role mô phỏng Supabase:

- Chuỗi `001 → 002 → 003 → seed` tạo được 45 slot. `003` từ chối schema v1 trước khi tạo hàm.
- `anon` và `authenticated` không gọi được RPC. `service_role` gọi được RPC nhưng `INSERT` trực tiếp vào bảng vẫn bị từ chối.
- Staff được gán tạo được slot. Bác sĩ ngoài quyền, quyền đã thu hồi, bác sĩ inactive, giờ đã qua, slot quá 30 ngày và thời lượng không hợp lệ bị từ chối đúng mã.
- Trùng hoặc giao giờ cùng bác sĩ trả `PT409`. Hai slot liền kề và hai slot cùng giờ khác bác sĩ đều được phép. Hai mốc thời lượng 15 và 120 phút đều được chấp nhận.
- Slot mới công bố xuất hiện trong truy vấn khả dụng. Đặt lịch tạo `requested` và loại slot khỏi truy vấn trống. Lượt đặt tiếp theo trả `PT409`. Staff ngoài quyền không xác nhận được, staff được gán chuyển lịch sang `confirmed` thành công.

Lượt kiểm tra trên Supabase dùng chung chỉ đọc. Các ca gọi đồng thời từ hai request độc lập, đăng nhập JWT thật và đồng bộ giao diện còn nằm trong kiểm thử tích hợp #35.

## Kịch bản bàn giao cho Tester

- Đăng nhập staff A, tải danh sách bác sĩ, tạo một slot tương lai chưa có lịch cho bác sĩ A. Tải lại trang và đối chiếu slot ID trong DB. Thử tạo cho bác sĩ B, kết quả `403`. Tạo một slot giao giờ hoặc gửi hai yêu cầu cùng khoảng trống, kết quả chỉ có một slot được tạo và yêu cầu còn lại nhận `409`.
- Mở luồng bệnh nhân và chọn đúng slot mới. Đặt bằng dữ liệu giả. Kiểm tra bản ghi `requested`, slot biến mất khỏi danh sách trống và hiển thị đã có lịch ở trang staff.
- Staff A xác nhận lịch vừa đặt. Đối chiếu `confirmed` trong DB và dashboard. Staff B không xem hoặc đổi được lịch đó. Lưu slot ID, kết quả HTTP và bằng chứng E2E vào #35.
- Dev Team review migration và Lead chốt contract trước khi áp dụng trên Supabase dùng chung. CI cục bộ và bản ghi seed không thay được ca staff tạo slot bằng JWT thật.
