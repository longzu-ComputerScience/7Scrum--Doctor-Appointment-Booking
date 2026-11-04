# Team workflow — 6 người, 6 issue

**Nguồn mới:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i), [API contract V2](API_CONTRACT_V2.md), [Data Dictionary](DATA_DICTIONARY.md). Code đã merge #27–#30, #38–#40 là **đầu vào**, không giao làm lại.

| Owner | Issue | Phạm vi file chính / phối hợp |
| --- | --- | --- |
| **BE1** | **#31** | `supabase/migrations/`, SQL RPC, schema, data/backfill/constraints; BE2 tiêu thụ signatures |
| **BE2** | **#32** | `backend/app/main.py`, `service.py`, `schemas.py`; cập nhật `docs/API_CONTRACT_V2.md` khi payload/route cần thay; Lead review |
| **FE1** | **#33** | `frontend/src/app/page.tsx`, auth/registration wrapper, Doctor Dashboard & notifications; **không sửa** FE2 booking modal/weekly editor |
| **FE2** | **#34** | `frontend/src/app/doctors/[id]/book/`, shared weekly editor (ví dụ `doctor/weekly-schedule-editor.tsx`), calendar realtime; FE1 import tại Doctor registration/dashboard |
| **Tester** | **#35** | `backend/tests/`, frontend E2E/test notes, môi trường shared Supabase; không sửa app logic |
| **Lead** | **#36** | Review contract/schema/PR, thống nhất route & component ownership, tích hợp US-01/02/03 và nghiệm thu |

**Tiếp nối:** #3→#31; #26→#32; #5→#33; #7/PR #27→#34; #9→#35; #25→#36. Các issue cũ sẽ đóng sau khi đã chuyển scope vào 6 issue, không phải đã nghiệm thu.

## Làm thế nào cho khỏi đụng code?

- **Contract chính thức nằm tại `docs/API_CONTRACT_V2.md`.** BE2 đề xuất thay đổi bằng commit/PR chứa chính endpoint, HTTP method, JSON request/response, status/error. BE1 xác nhận SQL tương ứng; Lead review rồi FE/QA mới áp dụng. Không ghi "chốt API" chung chung.
- FE1 làm auth/routes/dashboard, FE2 làm weekly-editor export component + booking calendar. Khi cần import editor vào Doctor registration, FE2 tạo component xong bàn giao props `weeklyIntervals/onChange`; FE1 chỉ tích hợp, tránh cùng sửa file.
- Tạo PR nhỏ theo issue. PR này chủ yếu docs; triển khai BE/FE/SQL giữ nhánh đang làm. **Không force-push/reset main, không sửa migration đã apply**, dùng migration additive và review cutover.
- Nếu DB thực tế khác tài liệu: giữ lại evidence schema và báo Lead trước khi chỉnh; không chạy SQL destructive.
- CI: FE lint/typecheck/build; BE Ruff/pytest; Tester chạy DB race/auth/schedule conflict/realtime riêng. CI pass không chứng minh PO acceptance.

**Scope:** Patient & Doctor, recurring weekly schedule, generated 30-minute slots, auto-confirm, 3 statuses, notifications. Không clinic staff manual slot, patient self-reschedule/cancel, external SMS/email, payment/production deploy.
