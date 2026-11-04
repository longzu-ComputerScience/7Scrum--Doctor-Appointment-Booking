# Chuyển quyền từ Staff sang Doctor · Issue #31

Nguồn nghiệp vụ: [PRD cập nhật](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.qnrlozg520mq), [BE1 #31](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/31) và [BE2 #32](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/32).

## Bản thay đổi để review

[004_doctor_self_only_schedule.sql](migrations/004_doctor_self_only_schedule.sql) bổ sung `doctor_accounts(auth_user_id, doctor_id, created_at)` với RLS. Bản này chọn liên kết một tài khoản Auth với một hồ sơ doctor và ngược lại. Quy trình lời mời của nhóm sẽ tạo liên kết sau khi xác minh danh tính. Không sao chép `staff_members` sang `doctor_accounts` vì quyền nhân viên cũ không chứng minh nhân viên là bác sĩ.

| RPC | Tham số | Kết quả |
|---|---|---|
| `create_doctor_slot` | `p_user_id uuid`, `p_start_at timestamptz`, `p_end_at timestamptz` | Một dòng `id`, `doctor_id`, `start_at`, `end_at`, `is_published`. Slot phải ở tương lai và đúng 30 phút. |
| `update_doctor_appointment_status` | `p_user_id uuid`, `p_appointment_id uuid`, `p_expected_status text`, `p_status text` | Một dòng `id`, `status`. Cho phép `confirmed → checked_in/cancelled` và `checked_in → completed/cancelled`. |

BE2 lấy `p_user_id` từ JWT đã xác thực. Body tạo slot chỉ gửi `startAt` và `endAt` có múi giờ. RPC tra doctor theo tài khoản, không nhận `doctor_id` từ người gọi. Backend có thể đọc `doctor_accounts` bằng `service_role` để lọc danh sách slot, appointments và hồ sơ đúng quyền. Quyền ghi slot và đổi trạng thái đi qua RPC có kiểm tra sở hữu. Chỉ cấp quyền gọi hai RPC cho `service_role` trong luồng API.

`PT403` là thiếu liên kết hoặc sai bác sĩ. `PT404` là không tìm thấy lịch hẹn. `PT422` là input sai. `PT409` là slot trùng/giao giờ, doctor inactive, bước chuyển sai hoặc status kỳ vọng đã cũ. FastAPI xử lý JWT thiếu/sai bằng `401` và lỗi hạ tầng bằng `503`.

`004` giữ nguyên booking cũ và quyền staff đang chạy. Bản này mới hoàn thành phần liên kết Doctor, tạo slot và đổi trạng thái sau xác nhận. Patient Auth, lời mời Doctor, booking auto-confirm và notification cần các thay đổi tiếp theo theo PRD. Các bản ghi `requested` cũ giữ nguyên để nhóm quyết định cách chuyển có kiểm soát.

## Thứ tự áp dụng trên Supabase test

1. Review `004` với Lead và BE2. Project đã chạy `003` chỉ cần áp dụng `004` sau khi được duyệt. Giữ nguyên `001`, `002` và `003` trong lịch sử Git.
2. Tạo tài khoản Auth giả cho hai Doctor. Tạo liên kết từ UID đã xác minh sang hai doctor demo khác nhau. Không dùng UID staff làm UID doctor chỉ vì từng được gán quyền.
3. BE2 chuyển các route đọc/ghi sang `doctor_accounts` và hai RPC mới. Xác minh account A chỉ thấy lịch A, slot đúng 30 phút, slot giao nhau trả `409` và Doctor B không thể đổi trạng thái lịch A.
4. Sau khi code đã triển khai không còn đọc `staff_members` hoặc gọi RPC cũ, lưu bản sao quyền staff, đối soát và có Lead xác nhận. Xem xét các bản ghi `requested` tồn đọng trước khi gỡ RPC đổi trạng thái cũ.
5. Dùng [script gỡ thủ công](cutover/retire_staff_members.sql) sau khi hoàn tất các bước trên. Script mặc định từ chối chạy, kiểm tra RPC mới và một mapping đã tồn tại, khóa bảng rồi từ chối nếu còn dòng quyền staff. Người vận hành cần backup và xử lý các dòng quyền cũ có chủ đích trước. Script dùng `RESTRICT` để ngăn xóa lan. Sau khi gỡ, kiểm tra lại route đọc/ghi và các dòng appointment/slot đã có.

## Review qua PR và lựa chọn revert

PR đề xuất lấy thay đổi mới trên `main`, dẫn `Refs #31`. Commit `2f20169` đã nằm trên `main` và migration `003` đã từng chạy qua SQL Editor. Git revert commit đó chỉ đổi file trên GitHub. Nó không gỡ RPC đã cài và có thể làm repo mất file migration đã áp dụng. Vì vậy PR thay thế giữ `003` trong lịch sử và đưa `004` cùng kế hoạch gỡ ra review.

Nếu Lead bắt buộc review lại nguyên thay đổi cũ, cần hai PR do Lead điều phối. PR đầu revert code cũ và ghi rõ ảnh hưởng tới lịch sử migration. Sau khi PR đó merge, PR sau được tạo từ `main` mới để đưa lại các file cần thiết theo thiết kế đã chốt. Phương án đó cần một kế hoạch riêng cho Supabase test. Không dùng reset hoặc force-push `main` để làm lại PR.

## Bằng chứng kiểm thử cục bộ

Đã chạy `001 → 002 → 003 → seed → 004` trên PostgreSQL nhúng với dữ liệu giả. Xác minh `004` giữ nguyên số lượng slot và lịch hẹn, không tự chuyển quyền staff sang doctor, từ chối liên kết trùng và chặn `anon`/`authenticated` gọi RPC. Hai Doctor tạo đúng slot của mình. Slot 29/31 phút và giờ quá khứ bị từ chối. Slot giao nhau trả `PT409`. RPC trạng thái chặn Doctor khác, bước chuyển sai và trạng thái kỳ vọng đã cũ.

Đã thử script gỡ trên bản sao cục bộ. Script mặc định từ chối chạy và vẫn từ chối khi có quyền staff chưa xử lý. Sau khi dọn fixture cũ trên bản sao, script gỡ bảng và hai RPC cũ. Số slot và lịch hẹn giữ nguyên, Doctor vẫn tạo được slot bằng RPC mới. Supabase dùng chung chưa áp dụng `004` hoặc bước gỡ.
