# Sprint handoff — hoàn thiện US-02 + US-03 hôm nay

**Nguồn:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i), [execution order](EXECUTION_ORDER.md). Đây là **chuỗi phụ thuộc**, không gán giờ cứng hoặc mở lại công việc đã merge.

## Giai đoạn A — freeze target & DB/API

- Lead #36 xác nhận nguồn PRD và **API_CONTRACT_V2.md**. Đã chọn `slotId` generated để tận dụng FE2 booking. BE1 #31 xác minh DB migration/backup; BE2 #32 đối chiếu endpoint với RPC.
- BE1 triển khai recurring working hours + Doctor/Patient Auth mapping, invitations, materialized 30-minute slots, 3 statuses, atomic appointment/notification (migration mới).
- BE2 triển khai Doctor GET/PUT schedule theo effectiveDate/409 conflicts, derived availability, Patient-authenticated booking 201 confirmed, notification/upcoming API. Không tiếp tục manual slot creator làm đích.

## Giai đoạn B — FE song song

- FE1 #33: nối Doctor List đã merge → Patient Auth/Profile → Doctor registration/login → dashboard, upcoming và notifications.
- FE2 #34: reusable weekly editor cho registration/dashboard; chuyển booking modal/calendar PR #27 sang generated slots/realtime, giữ UX đã có, tránh viết lại từ đầu.

## Giai đoạn C — test & review

- Tester #35: Auth role isolation, weekly validation, effective-date conflicts, availability 30-minute, booking race 1×201/1×409, status, atomic notification, realtime reconnect, timezone.
- Lead #36: review PR/CI, test tích hợp với same Supabase, US-01 chatbot → specialty → doctor, PO demo theo [Acceptance Scenario](ACCEPTANCE_SCENARIO.md).

Không coi file SQL merge hay mock UI là nghiệm thu. Phải có evidence trên cùng DB và quyết định PO.
