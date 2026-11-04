# Bảng theo dõi công việc — đúng 6 issue, TODAY US-02 + US-03

Nguồn: [PRD Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i), [API Contract V2](API_CONTRACT_V2.md), [Data Dictionary](DATA_DICTIONARY.md), [Implementation notes](DOCS_GUIDE.md).

| Vai trò | Issue hiện hành | Tận dụng US-02/PR đã có | Việc nối tiếp theo PRD mới |
| --- | --- | --- | --- |
| BE1 | **#31** | #3, PR #29; PR #38 SQL doctor_accounts | Migration mới weekly hours/patient profiles/notifications, generated slots, 3 status, booking+notification atomic |
| BE2 | **#32** | #26, PR #28; PR #39/#40 Doctor API/auth | Patient JWT/booking auto-confirm; Doctor recurring schedule, derived calendar, updates/conflicts, notifications APIs |
| FE1 | **#33** | #5, PR #30 Doctor List | Patient Auth + profile, Doctor invite registration/login, Dashboard/upcoming/notifications; kết nối Doctor List thật |
| FE2 | **#34** | #7 (đã đóng), PR #27 Booking Modal | Weekly editor reuse registration/dashboard, Patient 30-min calendar + realtime; booking response/errors |
| Tester | **#35** | #9 booking QA | E2E Auth, schedule, booking/concurrency, conflicts, status, notification/realtime |
| Lead | **#36** | #25, review #27–#30/#38–#40 | Final API contract + migration/ownership/PR integration, US-01, review và PO acceptance |

**Các issue #3, #5, #9, #25, #26 và #7 đóng để gộp**, không có nghĩa các AC mới đã đạt. Không tạo issue P0 thứ bảy trong hôm nay. Các issue #21/#22/#8/#19 đã đóng là lịch sử Clinic Staff, **không** còn dependency cho Doctor workflow.

**Thứ tự:** BE1/BE2 thống nhất DB RPC + API Contract → FE1/FE2 tích hợp (song song UI) → Tester chạy shared DB/E2E → Lead review và demo. Xem [EXECUTION_ORDER](EXECUTION_ORDER.md).
