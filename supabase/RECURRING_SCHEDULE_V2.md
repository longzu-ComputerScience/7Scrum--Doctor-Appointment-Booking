# Bàn giao DB #31 cho BE2 #32 · Lịch làm việc hằng tuần

Đặc tả DB của [PRD UPDATED VERSION](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i), [BE1 #31](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/31) và [BE2 #32](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/32). Các endpoint HTTP do BE2 chốt với [Lead #36](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/36).

## Quyết định để tích hợp

**Đặt lịch bằng `slotId`.** Khi Doctor lưu lịch, DB tự lưu khung 30 phút vào `appointment_slots` theo giờ Việt Nam. Khi FastAPI đọc lịch trống, RPC điền thêm các slot thiếu trong cửa sổ đặt lịch. Hai ngày đầu/cuối được tính, giới hạn từ hôm nay đến hôm nay + 30 ngày. FastAPI gửi UUID lấy từ availability vào booking RPC. Mỗi appointment mới tiếp tục có `slot_id` và lưu phiên bản lịch tại thời điểm đặt.

Supabase test `jlvdqrfnntxpbgomugdu` đã có `004`. Audit đọc ghi nhận 47 slot, một liên kết Doctor và 8 lịch hẹn (6 `requested`, 2 `cancelled`). Migration history rỗng vì nhóm áp dụng SQL qua SQL Editor. Dùng schema thực tế để xác nhận điều kiện trước khi chạy. `005` chưa áp dụng lên project dùng chung.

## Bảng và quy tắc

| Bảng / nhóm cột | Vai trò |
|---|---|
| `doctor_accounts` (004) | Liên kết một Auth UID với hồ sơ bác sĩ. Mọi thao tác Doctor tra từ UID đã xác thực. |
| `patient_profiles` | Hồ sơ bệnh nhân theo Auth UID. Tên và điện thoại được chụp lại khi đặt lịch. |
| `doctor_registration_invites` | Hash SHA-256 của mã mời ngẫu nhiên, doctor đã tồn tại, email đích, hạn dùng và `consumed_at`. Chỉ quản trị DB cấp mã. |
| `doctor_schedule_versions` + `doctor_working_hours` | Mỗi doctor có các bản lịch theo `effective_from`. Mỗi bản có nhiều khoảng giờ trong cùng ngày. Ngày khám dùng bản có `effective_from` gần nhất và không vượt ngày khám. |
| `appointment_slots` | Slot sinh tự động có `schedule_version_id`. Cùng bác sĩ và cùng khoảng giờ giữ UUID khi sinh lại. Slot hết hiệu lực bị ẩn qua `is_published = false`. Ràng buộc GiST chặn hai slot đang mở giao nhau. |
| `appointments` | Bổ sung `booking_doctor_id`, `booking_start_at`, `booking_end_at`, `patient_auth_user_id`, `schedule_version_id`. Backfill bác sĩ và thời gian từ slot cũ, giữ nguyên ID, trạng thái, mã tham chiếu và timestamp. |
| `appointment_notifications` | Tối đa một notification cho mỗi booking mới, có `read_at`. Nội dung tên bệnh nhân và giờ lấy từ appointment khi API đọc đúng phạm vi Doctor. |
| `doctor_calendar_revisions` | Một dòng theo doctor để báo client tải lại lịch. Payload chỉ có doctor ID, revision và thời điểm đổi. |

Khoảng thời gian dùng `[start, end)`. Hai khung liền nhau được phép. Một slot chỉ có một appointment chưa hủy. GiST trên `booking_doctor_id` và khoảng thời gian của appointment còn chặn đặt chồng qua hai slot khác nhau. Slot cũ đã bị ẩn vẫn giữ FK lịch sử. Lịch mới có ba trạng thái `confirmed`, `completed`, `cancelled` và chỉ chuyển từ `confirmed` sang `completed` hoặc `cancelled`. Giữ nguyên `requested` hoặc `checked_in` cũ để đối soát. Sau khi lịch tuần có hiệu lực, đường cũ không được tạo slot thủ công, tạo booking `requested` hoặc nâng `requested` lên `confirmed` cho ngày thuộc lịch tuần.

## Chữ ký RPC để #32 gọi

| RPC | Input | Output / quy tắc |
|---|---|---|
| `save_patient_profile` | `p_user_id uuid`, `p_full_name text`, `p_phone text` | Auth UID của bệnh nhân. UID lấy từ JWT đã xác thực. |
| `complete_doctor_registration` | `p_user_id uuid`, `p_invite_code text`, `p_intervals jsonb` | Một dòng `doctor_id`, `schedule_version_id`. Liên kết hồ sơ, lưu lịch ban đầu và đánh dấu mã đã dùng trong một giao dịch. |
| `save_doctor_working_hours` | `p_user_id uuid`, `p_effective_from date`, `p_intervals jsonb` | UUID của phiên bản mới. Phiên bản đầu có thể bắt đầu hôm nay. Các lần sửa chọn ngày tương lai theo giờ Việt Nam. Một ngày hiệu lực chỉ có một bản lịch. |
| `list_doctor_availability` | `p_doctor_id uuid`, `p_from date`, `p_to date` | Danh sách `slot_id`, `start_at`, `end_at` sắp theo giờ. RPC có thể ghi slot mới, nên gọi bằng POST qua PostgREST. FastAPI có thể tiếp tục phục vụ HTTP GET và trả `slot_id` thành `id` theo contract. |
| `book_recurring_appointment` | `p_user_id uuid`, `p_slot_id uuid`, `p_notes text` mặc định `''` | Một dòng `appointment_id`, `booking_reference`, `status = confirmed`, `start_at`, `end_at`. FastAPI nhận `slotId`, gửi `p_slot_id` và trả HTTP 201 từ kết quả RPC. Booking, thông báo và revision cùng commit hoặc cùng rollback. |
| `update_recurring_appointment_status` | `p_user_id uuid`, `p_appointment_id uuid`, `p_status text` | Một dòng `id`, `status`. Chỉ Doctor sở hữu lịch được thao tác và chỉ chuyển từ `confirmed`. |
| `mark_doctor_notification_read` | `p_user_id uuid`, `p_notification_id uuid` | Timestamp đọc. Gọi lại giữ thời điểm đọc đầu tiên. |

`p_intervals` là mảng từ một khoảng trở lên. `weekday` dùng ISO 1–7, thứ Hai là 1. `startMinute` và `endMinute` là phút trong ngày tại `Asia/Ho_Chi_Minh`. Mỗi khoảng dài bội số 30 phút, tối thiểu 30 phút, và không giao với khoảng khác cùng ngày. Mốc `1440` chỉ hợp lệ ở cuối khoảng. Ví dụ thứ Hai làm hai ca:

```json
[
  {"weekday": 1, "startMinute": 540, "endMinute": 720},
  {"weekday": 1, "startMinute": 780, "endMinute": 1020}
]
```

| Mã | Cách xử lý ở BE |
|---|---|
| `401` | Thiếu JWT, JWT sai hoặc hết hạn. BE xác thực trước khi gọi RPC. |
| `PT403` → `403` | Vai trò không khớp, mã mời sai/hết hạn hoặc thao tác ngoài quyền Doctor. |
| `PT404` → `404` | Không tìm được appointment hoặc notification trong thao tác tương ứng. |
| `PT422` → `422` | Input không hợp lệ, lịch tuần giao nhau hoặc effective date sai. BE kiểm tra UUID và định dạng ngày trước khi gọi RPC. |
| `PT409` → `409` | Slot đã bị chiếm, không còn trong lịch đang hiệu lực, xung đột trạng thái hoặc đã có phiên bản cùng ngày. Với lỗi thay đổi lịch đụng booking, parse JSON trong `details` của lỗi thành `conflicts`. |
| `PT503`/lỗi hạ tầng → `503` | Không báo đặt lịch thành công. |

Ví dụ `conflicts` trả từ SQL DETAIL có `[{"appointmentId":"…","startAt":"…","endAt":"…"}]`. FastAPI trả `409 SCHEDULE_CONFLICT` kèm danh sách này. Khi xung đột, RPC không lưu phiên bản mới và không sửa, hủy hoặc dời lịch đã đặt. Ba thao tác đổi lịch, sinh slot và booking cùng khóa dòng doctor. Booking kiểm tra lại UUID đã chọn còn mở, còn ở tương lai và vẫn thuộc đúng phiên bản lịch trước khi ghi.

## Đọc dữ liệu và realtime

- **API Doctor:** tra `doctor_accounts.auth_user_id` từ JWT, rồi giới hạn theo `doctor_id`. Đọc lịch tuần từ `doctor_schedule_versions` và `doctor_working_hours`. Đọc lịch hẹn bằng `appointments.booking_doctor_id`, `booking_start_at` và `booking_end_at`. Upcoming chỉ lấy `confirmed`, thời gian bắt đầu ở tương lai, sắp tăng dần. Lọc ba trạng thái đích trong giao diện mới, dùng quy trình đối soát riêng cho legacy rows.
- **API Patient:** dùng `list_doctor_availability` cho calendar. Không truy vấn trực tiếp `appointments` từ browser. Patient chưa đăng nhập không gọi booking. Sau khi đăng nhập, dùng Auth UID từ token và hồ sơ đã lưu, không tin `userId` do body cung cấp.
- **Realtime:** browser đã đăng nhập có thể subscribe `doctor_calendar_revisions` theo doctor ID, sau đó gọi lại API availability khi nhận event hoặc reconnect. Doctor chỉ đọc được dòng notification của chính mình qua RLS. API đọc chi tiết theo `appointment_id` sau khi xác thực Doctor. `005` thêm hai bảng vào publication `supabase_realtime` nếu publication tồn tại. Mục tiêu cập nhật trên giao diện cần đo bằng kiểm thử #35.
- **Secrets:** giữ `service_role` ở backend. JWT xác định user, mã mời có entropy cao và chỉ lưu hash. Không đưa key, mật khẩu hay mã mời thật vào repo hoặc log.

## Áp dụng, demo và gỡ đường cũ

1. Review [migration 005](migrations/005_recurring_doctor_schedule.sql). Dùng backup hoặc bản sao của Supabase test để kiểm tra số dòng, ID và trạng thái cũ trước/sau. Project hiện đã có `004`, nên sau phê duyệt chỉ chạy `005`. Giữ các migration đã áp dụng trong Git.
2. Tạo hai user Auth giả bằng Dashboard, một Doctor và một Patient. Chạy [seed_recurring_demo.sql](seed_recurring_demo.sql) với hai UID đã xác minh trên project test. Seed dùng BS. Nguyễn Minh An, lịch thứ Hai–thứ Sáu **09:00–12:00, 13:00–17:00**. Chạy lại giữ lịch đã tạo. Nếu bác sĩ đã liên kết qua `004` nhưng chưa có lịch tuần, seed thêm lịch ban đầu. Seed không tạo slot thủ công.
3. Trên môi trường dùng chung, chỉ tạo lịch tuần cho bác sĩ sau khi BE2 chuyển đồng thời API đọc slot và booking sang hai RPC mới. Bật thử trên một bác sĩ test, xác minh quyền với hai tài khoản Doctor rồi gửi hai request độc lập từ hai Patient cho cùng UUID. Kết quả cần đúng một HTTP 201, một HTTP 409, một lịch `confirmed` và một notification. Kiểm tra thêm Realtime trên môi trường này.
4. `005` giữ `staff_members`, `003` và `004`. Việc gỡ đường cũ tách riêng sau đối soát các booking legacy. Khi lịch tuần được lưu, các slot cũ ngoài lịch trong cửa sổ được ẩn. Một slot legacy còn mở cắt qua ranh giới ngày có thể chặn khung giao nhau cho đến khi được đối soát.
5. Migration chạy trong một transaction và tự rollback nếu SQL lỗi trước commit. Sau khi áp dụng, nếu đã có lịch tuần hoặc booking mới, tạm dừng ghi cho bác sĩ bị ảnh hưởng rồi đối soát theo `appointments.schedule_version_id`, FK `slot_id` và notification. Ưu tiên bản vá tiến tới. Chỉ khôi phục backup trên bản sao để kiểm tra trước khi quyết định xử lý DB dùng chung.

## Kiểm thử SQL

Trên DB dùng một lần có Auth schema, chạy `001 → 002 → 003 → 004`, seed v2, chạy `005`, rồi chạy [005_recurring_schedule.sql](tests/005_recurring_schedule.sql). Test dùng Auth ID giả và rollback ở cuối. Test kiểm tra mã mời, lịch giao nhau, tạo và tái sử dụng UUID, chặn đặt trùng, rollback khi ghi notification lỗi, trả danh sách xung đột và giữ lịch sử sau khi đổi lịch. Ca tranh chấp bằng hai kết nối độc lập và JWT/Realtime thật thuộc kiểm thử tích hợp trên Supabase test.
