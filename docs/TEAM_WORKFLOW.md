# Team workflow — 6 người, 6 issue · phân công, dependency và sprint handoff

**Nguồn mới:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i), [API contract V2](API_CONTRACT_V2.md), [Data Dictionary](DATA_DICTIONARY.md). Code đã merge #27–#30, #38–#40 là **đầu vào**, không giao làm lại.

| Owner | Issue | Phạm vi file chính / phối hợp |
| --- | --- | --- |
| **BE1** | **#31** | `supabase/migrations/`, SQL RPC, schema, data/backfill/constraints; BE2 tiêu thụ signatures |
| **BE2** | **#32** | `backend/app/main.py`, `service.py`, `schemas.py`; cập nhật `docs/API_CONTRACT_V2.md` khi payload/route cần thay; Lead review |
| **FE1** | **#33** | `frontend/src/app/page.tsx`, auth/registration wrapper, Doctor Dashboard & notifications; **không sửa** FE2 booking modal/weekly editor |
| **FE2** | **#34** | `frontend/src/app/doctors/[id]/book/`, shared weekly editor (ví dụ `doctor/weekly-schedule-editor.tsx`), calendar realtime; FE1 import tại Doctor registration/dashboard |
| **Tester** | **#35** | `backend/tests/`, frontend E2E/test notes, môi trường shared Supabase; không sửa app logic |
| **Lead** | **#36** | Review contract/schema/PR, thống nhất route & component ownership, tích hợp US-01/02/03 và nghiệm thu |

**Tiếp nối (mapping 6 issue cũ → hiện hành): #3→#31; #26→#32; #5→#33; #7/PR #27→#34; #9→#35; #25→#36. Các issue cũ đã đóng để gộp scope; không có nghĩa đã nghiệm thu.

## Làm thế nào cho khỏi đụng code?

- **Contract chính thức nằm tại `docs/API_CONTRACT_V2.md`.** BE2 đề xuất thay đổi bằng commit/PR chứa chính endpoint, HTTP method, JSON request/response, status/error. BE1 xác nhận SQL tương ứng; Lead review rồi FE/QA mới áp dụng. Không ghi "chốt API" chung chung.
- FE1 làm auth/routes/dashboard, FE2 làm weekly-editor export component + booking calendar. Khi cần import editor vào Doctor registration, FE2 tạo component xong bàn giao props `weeklyIntervals/onChange`; FE1 chỉ tích hợp, tránh cùng sửa file.
- Tạo PR nhỏ theo issue. PR này chủ yếu docs; triển khai BE/FE/SQL giữ nhánh đang làm. **Không force-push/reset main, không sửa migration đã apply**, dùng migration additive và review cutover.
- Nếu DB thực tế khác tài liệu: giữ lại evidence schema và báo Lead trước khi chỉnh; không chạy SQL destructive.
- CI: FE lint/typecheck/build; BE Ruff/pytest; Tester chạy DB race/auth/schedule conflict/realtime riêng. CI pass không chứng minh PO acceptance.

**Scope:** Patient & Doctor, recurring weekly schedule, generated 30-minute slots, auto-confirm, 3 statuses, notifications. Không clinic staff manual slot, patient self-reschedule/cancel, external SMS/email, payment/production deploy.

## Chi tiết kế thừa từ US-02 (issue mapping)

| Vai trò | Issue hiện hành | Tận dụng US-02/PR đã có | Việc nối tiếp theo PRD mới |
| --- | --- | --- | --- |
| BE1 | **#31** | #3, PR #29; PR #38 SQL doctor_accounts | Migration mới weekly hours/patient profiles/notifications, generated slots, 3 status, booking+notification atomic |
| BE2 | **#32** | #26, PR #28; PR #39/#40 Doctor API/auth | Patient JWT/booking auto-confirm; Doctor recurring schedule, derived calendar, updates/conflicts, notifications APIs |
| FE1 | **#33** | #5, PR #30 Doctor List | Patient Auth + profile, Doctor invite registration/login, Dashboard/upcoming/notifications; kết nối Doctor List thật |
| FE2 | **#34** | #7 (đã đóng), PR #27 Booking Modal | Weekly editor reuse registration/dashboard, Patient 30-min calendar + realtime; booking response/errors |
| Tester | **#35** | #9 booking QA | E2E Auth, schedule, booking/concurrency, conflicts, status, notification/realtime |
| Lead | **#36** | #25, review #27–#30/#38–#40 | Final API contract + migration/ownership/PR integration, US-01, review và PO acceptance |

**Ghi chú:** Các issue #3/#5/#9/#25/#26/#7 đã đóng để gộp; không tự suy ra các acceptance criteria mới đã pass. #21/#22/#8/#19 chỉ là lịch sử Clinic Staff.

## Thứ tự thực hiện và phụ thuộc tích hợp

1. **BE1 + BE2 + Lead:** kiểm tra DB thật và API Contract V2 (đã chọn giữ generated `slotId`), chốt SQL/RPC signatures, migration/rollback và sample payload. Nếu không khớp code thì **cập nhật contract trong PR của người sửa** và nhờ Lead review, không gọi "chốt" chung chung.
2. **FE1 + FE2 song song:** FE1 phụ trách wrapper đăng ký/đăng nhập/dashboard; FE2 xây weekly editor reusable rồi FE1 import, FE2 giữ toàn quyền booking modal/calendar; chia sẻ API/types, không sửa cùng file không phối hợp.
3. **BE1/BE2:** thay đổi DB và endpoint có backward compatibility/cutover hợp lý; không DROP table/constraint cũ hoặc coi file SQL là DB đã migrate.
4. **Tester + Lead:** chạy case schedule conflict, auth isolation, booking race + notification atomic, realtime reconnect, response 201 confirmed, status terminal; check lint/build/pytest ở commit tích hợp. Lead nhận PO sign-off.

```text
BE1 #31 schema/RPC  <-->  BE2 #32 HTTP/contract
        |                      |
        +----> FE2 #34         +----> FE1 #33
                     \            /
                        Tester #35
                            |
                        Lead #36
```



## Sprint handoff (theo phụ thuộc, không gán deadline cứng)

### Giai đoạn A — freeze target & DB/API

- Lead #36 xác nhận nguồn PRD và **API_CONTRACT_V2.md**. Đã chọn `slotId` generated để tận dụng FE2 booking. BE1 #31 xác minh DB migration/backup; BE2 #32 đối chiếu endpoint với RPC.
- BE1 triển khai recurring working hours + Doctor/Patient Auth mapping, invitations, materialized 30-minute slots, 3 statuses, atomic appointment/notification (migration mới).
- BE2 triển khai Doctor GET/PUT schedule theo effectiveDate/409 conflicts, derived availability, Patient-authenticated booking 201 confirmed, notification/upcoming API. Không tiếp tục manual slot creator làm đích.

### Giai đoạn B — FE song song

- FE1 #33: nối Doctor List đã merge → Patient Auth/Profile → Doctor registration/login → dashboard, upcoming và notifications.
- FE2 #34: reusable weekly editor cho registration/dashboard; chuyển booking modal/calendar PR #27 sang generated slots/realtime, giữ UX đã có, tránh viết lại từ đầu.

### Giai đoạn C — test & review

- Tester #35: Auth role isolation, weekly validation, effective-date conflicts, availability 30-minute, booking race 1×201/1×409, status, atomic notification, realtime reconnect, timezone.
- Lead #36: review PR/CI, test tích hợp với same Supabase, US-01 chatbot → specialty → doctor, PO demo theo [Acceptance Scenario](ACCEPTANCE_SCENARIO.md).

Không coi file SQL merge hay mock UI là nghiệm thu. Phải có evidence trên cùng DB và quyết định PO.

**Nguồn chuẩn:** [PRD cập nhật](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i), [API Contract V2](API_CONTRACT_V2.md), [Data Dictionary](DATA_DICTIONARY.md). Mọi checklist trong issue #31–#36 được giữ nguyên; tài liệu này chỉ hỗ trợ phối hợp.
