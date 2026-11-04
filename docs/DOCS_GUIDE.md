# Documentation — tài liệu nào là chuẩn?

**Ngày đối chiếu:** 2026-11-04. **Business source of truth:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i); [Requirements PRD nền](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.qnrlozg520mq) dùng cho phần không bị sửa. Tab t.0 và bản US-03 clinic staff là **lịch sử**, không phải scope Doctor mới.

## Đọc theo thứ tự

1. **Nghiệp vụ cập nhật:** Doctor invitation registration + initial weekly schedule → system auto-generate 30-minute availability → Patient authenticated calendar → atomic booking **confirmed** → persistent real-time Doctor notifications/upcoming → Doctor đổi weekly hours theo effective date, **block conflicts**, không hủy/move lịch cũ.
2. **API mục tiêu:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md) — danh sách endpoint, payload, errors, owner. Đã chọn **giữ `slotId` được system sinh tự động** để tối thiểu thay đổi FE2 US-02. Nếu Lead thay đổi quyết định, phải sửa contract và thông báo BE/FE/QA trong PR trước khi triển khai.
3. **Database mục tiêu:** [DATA_DICTIONARY.md](DATA_DICTIONARY.md) — patient_profiles, doctor_accounts, doctor_working_hours, generated slots, appointments, notifications, invites; migration additive.
4. **Cơ sở SQL hiện tại:** [schema_v2.sql](../supabase/schema_v2.sql) và [migrations 001–004](../supabase/migrations/). **Chưa đồng nhất với target mới.** `schema_v2.sql` là bootstrap V2 trước recurring schedule, không phải migration lên DB chứa dữ liệu.
5. **Legacy API:** [legacy/API_CONTRACT.md](legacy/API_CONTRACT.md) dành để đọc/đối chiếu code cũ; không làm contract P0 mới.

6. **Phối hợp 6 issue:** [TEAM_WORKFLOW.md](TEAM_WORKFLOW.md) — ownership, mapping, execution order, sprint handoff và tránh conflict. Checklist của từng người nằm trong issue #31–#36.

## Baseline trước cập nhật docs: main 2026-11-04 (commit 05a5f52)

- PR #27–#30 (US-02), #38 (doctor_accounts + manual-slot RPC), #39 (Doctor HTTP API), #40 (doctor auth mapping) đã merge; **tận dụng lại**, không giao làm lại.
- Booking BE: `POST /api/appointments` nhận `slotId` nhưng schema còn `requested`; code Doctor còn `POST /api/doctor/slots` manual và status `checked_in`. FE2 booking modal đã có và kỳ vọng `confirmed`. Staff page/slots legacy vẫn tồn tại. **Code và target đang khác nhau**, BE1/BE2/FE phải tích hợp tuần tự.
- DB thật chưa được xác minh migration mới trong lần cập nhật tài liệu này; **không đồng nghĩa GitHub SQL đã chạy lên Supabase**. Không sửa hoặc xóa migration cũ gây hỏng môi trường đã áp dụng.

## Quy tắc tránh conflict khi sửa

- **BE1 #31:** chỉ `supabase/`, migration mới, RPC, seed/identity, generated slots, DB atomic appointment+notification.
- **BE2 #32:** `backend/app/main.py`, `service.py`, `schemas.py`, cập nhật `API_CONTRACT_V2.md` nếu endpoint/payload thật khác target; phối hợp BE1 khi đổi DB RPC. **Chốt API contract = đưa URL + method + JSON request/response + lỗi vào đúng tài liệu này và Lead #36 review**.
- **FE1 #33:** Patient Auth/Profile + Doctor List đã merge (US-02), Doctor registration/login, Doctor Dashboard, notifications/upcoming (US-03). Không sửa booking modal/weekly editor của FE2.
- **FE2 #34:** reusable Doctor weekly editor dùng lúc registration và dashboard, giữ booking modal từ PR #27; đổi patient calendar sang generated intervals + realtime. Phối hợp FE1 ở registration wrapper/navigation.
- **Tester #35:** test Auth, weekly hours, 30-minute derivation, effective-date conflicts, booking 201 confirmed/409 race, notification/upcoming/realtime.
- **Lead #36:** kiểm soát giao diện tích hợp, review migration/PR, demo/PO acceptance và đảm bảo US-01 vẫn có đường đi vào US-02.

**Active issue:** chỉ #31–#36 (mỗi role một issue). US-02 cũ #3/#5/#9/#25/#26 đóng **superseded**, không có nghĩa toàn bộ AC đã nghiệm thu.

## Phạm vi và bằng chứng

- Đích là **Patient/Doctor** (không clinic staff); Doctor tự quản lịch định kỳ, không tạo slot từng cái.
- Chỉ 3 status `confirmed/completed/cancelled`; `requested/checked_in` là dữ liệu/API lịch sử cần migration có kiểm soát.
- Notification realtime + calendar realtime có **mục tiêu ~5 giây bình thường**, nhưng reconnect/refetch phải đúng; không thay DB locking bằng realtime.
- Mọi PR ghi rõ code hiện có tận dụng, phần mới, đường migration, lệnh test đã chạy, thiếu bằng chứng nào. Không đánh dấu Done chỉ vì CI xanh.
