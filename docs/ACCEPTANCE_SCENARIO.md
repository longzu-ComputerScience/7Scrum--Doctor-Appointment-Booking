# Acceptance scenario — Doctor schedule → Patient booking → Doctor notification

**Nguồn:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i). **Status:** NOT VERIFIED on the shared Supabase. Target: [API_CONTRACT_V2](API_CONTRACT_V2.md) + [DATA_DICTIONARY](DATA_DICTIONARY.md). Không dùng kịch bản clinic staff confirm thủ công của tab cũ.

| Bước | Người dùng | Hành động | Điều kiện đạt |
| --- | --- | --- | --- |
| 1 | Doctor | Đăng ký bằng invitation hợp lệ, chọn Monday 09:00–12:00 và 13:00–17:00 | Account liên kết doctor có sẵn; weekly schedule lưu DB |
| 2 | Doctor/Patient | Doctor đăng nhập; Patient tự đăng ký/đăng nhập | JWT/role đúng; Patient không vào Doctor Dashboard |
| 3 | Patient | Chat triệu chứng da, nhận follow-up và Dermatology; vào Doctor List | Specialty đúng, doctor thực từ DB |
| 4 | Patient | Xem calendar của Doctor | Slot 30 phút từ lịch tuần tự hiện; không cần Doctor publish thủ công |
| 5 | Patient | Chọn slot, xác nhận booking | HTTP 201 `confirmed` + reference; appointment + notification đã lưu; Doctor/profile đúng |
| 6 | Patient/Doctor | Hai booking cùng interval; kết nối real-time | Một 201/một 409; slot occupied trên các calendar; reconnect/refetch vẫn chính xác |
| 7 | Doctor | Mở Dashboard → Notifications và Upcoming | Notification persistent/unread, appointment tương ứng future confirmed; mark-read lưu được |
| 8 | Doctor | Sửa weekly schedule từ effectiveDate tương lai, thử bỏ khoảng giờ chứa confirmed booking | BE trả 409 + conflicts; không áp lịch mới; appointment còn nguyên |
| 9 | Doctor | Sửa lịch không xung đột; đổi appointment `confirmed → completed/cancelled` | Lịch mới áp dụng đúng ngày; chỉ 3 status; slot cancelled mở lại nếu vẫn hợp lệ |

## Test evidence / review

- Main SHA, branch/PR, API contract revision, Supabase project/schema/migrations đã thực thi:
- Doctor/Patient Auth synthetic IDs; không ghi token/password:
- HTTP 201/409/401/403/422/503, screenshot/calendar/notifications; latency realtime + reconnect:
- DB slot/appointment/notification counts trước/sau race và schedule conflict:
- CI/lint/build/pytest, reviewer:
- Defects, Lead review, PO feedback và quyết định:

Một lỗi critical ở Auth, confirmed status, booking integrity, schedule conflict hoặc notification là **chưa đạt**. CI green hoặc SQL nằm trong Git **không thay bằng evidence live DB**.
