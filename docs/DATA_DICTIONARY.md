# Data Dictionary — target nghiệp vụ Doctor recurring schedule (2026-11-04)

**Nguồn:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i) ưu tiên so với [PRD cũ](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.qnrlozg520mq). **Đồng bộ API:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md). Đây là **target thay đổi tiếp theo**, không phải mô tả khẳng định live Supabase đã có tất cả bảng/cột. [schema_v2.sql](../supabase/schema_v2.sql) là **bootstrap V2 trước PRD recurring**, và [004 migration](../supabase/migrations/004_doctor_self_only_schedule.sql) mới bổ sung doctor_accounts + RPC tạo slot thủ công; **chưa có recurring working hours/notifications/patient profiles**. Xem [DOCS_GUIDE.md](DOCS_GUIDE.md).

## Bảng nghiệp vụ mục tiêu

| Bảng | Dữ liệu tối thiểu | Lưu ý kiểm soát |
| --- | --- | --- |
| `doctors` | `id uuid PK`, `name`, `specialty`, `bio`, `address`, `district`, `certificates jsonb`, `rating nullable`, `rating_count`, `active`, timestamps | Giữ doctor IDs cũ. Không có clinic/room trong target mới. |
| `patient_profiles` (**mới**) | `auth_user_id uuid PK/FK auth.users`, `name`, `phone`, `created_at`, `updated_at` | User Patient tự đăng ký; không lưu password. |
| `doctor_accounts` (**đã có migration 004**) | `auth_user_id uuid PK/FK auth.users`, `doctor_id uuid UNIQUE FK doctors`, `created_at` | 1 Auth user ↔ 1 Doctor profile. Không tự copy quyền `staff_members`. |
| `doctor_registration_invites` (**mới**) | `id`, `doctor_id FK`, `code_hash unique`, `expires_at`, `used_at nullable`, `created_at` | Invitation một lần, gắn Doctor profile đã tồn tại; mã thô không lưu/log công khai. |
| `doctor_working_hours` (**mới**) | `id`, `doctor_id FK`, `day_of_week`, `start_time`, `end_time`, `effective_from`, `effective_to nullable`, `schedule_version` | 1=Mon..7=Sun; giờ địa phương VN; một ngày có nhiều interval; >=30 phút, bội 30, không overlap; update theo version/effective date. |
| `appointment_slots` (**tận dụng lại**) | `id uuid PK`, `doctor_id FK`, `start_at timestamptz`, `end_at timestamptz`, `is_published` (legacy field) | **System materializes 30-minute slots** từ `doctor_working_hours`; Doctor không tạo/mở slot. `slotId` vẫn phục vụ FE2 US-02; lọc slots ngoài weekly rule. |
| `appointments` (**mở rộng**) | `id`, `slot_id FK`, **`patient_id FK patient_profiles`**, `patient_name`, `patient_phone`, `notes`, `status`, `booking_reference unique`, timestamps | Status mới `confirmed/completed/cancelled`; initial `confirmed`, không `requested/checked_in`; cần migration data cũ có kiểm soát. |
| `appointment_notifications` (**mới**) | `id`, `doctor_id FK`, `appointment_id FK`, `created_at`, `read_at nullable` | Ghi atomically với successful appointment; chỉ Doctor sở hữu xem/mark-read. |

**`auth.users`** do Supabase Auth quản lý. Các tên bảng/cột **mới** là thiết kế cần BE1 #31 triển khai sau khi rà thực trạng DB. NFR yêu cầu persist và role isolation. Không tự xóa `staff_members` hoặc `requested` lịch sử khi chưa audit/cutover.

## Bất biến DB và business rules

1. **Doctor schedule:** mỗi Doctor có nhiều interval theo weekday; `start_time < end_time`, duration >=30 phút và là bội số 30 phút; interval cùng weekday **không overlap trong cùng version/effective period**. Schedule version mới có `effective_from` tương lai; khoảng cũ còn hiệu lực đến ngày trước đó. FE hiển thị `Asia/Ho_Chi_Minh` (lưu lịch tuần dưới local time/date); timestamps của booking lưu `timestamptz` UTC.
2. **Effective-date guard:** trước khi cập nhật lịch, trong cùng transaction kiểm tra các appointment `confirmed` bị ảnh hưởng kể từ `effectiveDate`; nếu có, trả danh sách IDs/time và **không cập nhật schedule**. Không tự hủy/dời appointment. `completed`/`cancelled` là terminal.
3. **Generated slots:** các khung `[start_at,end_at)` dài đúng 30 phút; BE tạo từ working intervals, **không tạo bằng tay từ Doctor**. Index/exclusion theo Doctor/time ngăn giao giờ. Cần cách đồng bộ/idempotent, horizon hữu hạn; không xóa slot có appointment history. GET không trả slot cũ ngoài active weekly rules.
4. **Booking:** JWT Patient → `patient_profiles`; DB recheck đúng Doctor, effective schedule, 30 phút, future, active, unoccupied. Unique partial index `appointments(slot_id) WHERE status <> 'cancelled'` + transaction lock. **Một booking thành công = appointment `confirmed` và notification persist**, tất cả cùng commit hoặc rollback. Booking thất bại không ghi appointment/notification.
5. **Notifications:** unique `appointment_id` hoặc idempotent equivalent để không tạo trùng; Doctor đọc lịch của mình qua `doctor_accounts`, Patient không đọc thông tin của người khác. Realtime chỉ là cơ chế cập nhật UI; DB vẫn là nguồn sự thật.
6. **Appointment status:** `confirmed → completed|cancelled`; `completed` và `cancelled` terminal. Cancelled không chiếm slot; slot chỉ mở lại nếu Doctor active, slot tương lai và thuộc weekly schedule đang hiệu lực.
7. **Auth:** patient self-registration tạo profile liên kết user; Doctor invitation used-once tạo Auth link tới doctor profile có sẵn và lưu initial weekly intervals **như một workflow nhất quán**. Cần rollback/compensation nếu Auth provider và DB không chung transaction.

## Trạng thái hiện tại trên main — không nhầm với target

- `supabase/schema_v2.sql` và `migrations/001_init.sql`: bootstrap **4 bảng cũ** `doctors/appointment_slots/appointments/staff_members`; status mặc định `requested`, có `checked_in`, **không có** recurring weekly hours, patient profiles, notifications.
- `migrations/003_staff_create_slot_v2.sql`: legacy staff tạo slot.
- `migrations/004_doctor_self_only_schedule.sql`: thêm `doctor_accounts`, RPC `create_doctor_slot` (tạo **từng slot thủ công**) và update status vẫn có `checked_in`. **PR #38/#39/#40 đã merge, không có nghĩa đạt PRD mới**.
- `backend/app/main.py`, `schemas.py`, `service.py`: tồn tại Doctor endpoint nhưng **chưa có API GET/PUT recurring schedule**; booking vẫn dùng slotId và response schema `requested`; Frontend `staff/` còn clinic staff code.
- **Shared Supabase live:** phải kiểm tra schema và migration thực sự được áp dụng; commit SQL hoặc test cục bộ **không chứng minh live DB**.

## Migration và bàn giao BE1 #31

1. Audit & backup shared DB, ghi baseline schema/data, versions của `001..004`. Không chạy `schema_v2.sql` trên DB đã có dữ liệu và không sửa lại migrations đã áp dụng.
2. Làm **migration mới additive**, thêm `patient_profiles`, `doctor_working_hours`, `appointment_notifications`, invites (nếu dùng), `patient_id` và các constraint/index cần thiết. Giữ mọi appointment/slot có thật và doctor/auth mappings.
3. Chuyển status **bằng kế hoạch audit**: `requested` cũ cần quyết định xử lý từng bản ghi, `checked_in` cũ cần đối soát; không đổi âm thầm mọi bản ghi thành `confirmed`. Sau cutover new bookings chỉ dùng 3 status.
4. Chuyển slot generation từ manual RPC sang internal materializer; giữ `slotId` contract để FE2 không phải viết lại hoàn toàn. Test nhiều khoảng giờ trong ngày, effective dates, xung đột lịch confirmed, slot hiện tại vs lịch sử.
5. Bảo vệ DB atomic booking+notification, race 1×201/1×409 và ownership JWT mapping; cung cấp SQL/RPC signatures + test evidence cho BE2 #32, Tester #35.
6. Chỉ sau khi BE/FE chạy workflow mới và Lead #36 phê duyệt mới retire legacy staff/manual RPCs và constraints dư thừa; rollback phải tính dữ liệu booking phát sinh sau cutover.

**Kiểm thử:** [ACCEPTANCE_SCENARIO.md](ACCEPTANCE_SCENARIO.md), [DEFINITION_OF_DONE.md](DEFINITION_OF_DONE.md). Test trạng thái `confirmed`, timezone, overlap, patient/doctor permissions, notifications, reconnect và lịch đã xác nhận khi đổi effectiveDate.
