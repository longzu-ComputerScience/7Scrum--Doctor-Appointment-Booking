# Execution order — 6 issue hôm nay

**Business:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i); **contract:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md); **DB target:** [DATA_DICTIONARY.md](DATA_DICTIONARY.md). Main đã merge #27–#30, #38–#40, **không viết lại các phần đã có**.

| Vai trò | Issue | Làm tiếp từ code hiện tại |
| --- | --- | --- |
| BE1 | **#31** | Audit shared DB và thực thi migration mới (không chạy lại 001–004); working hours/auto-slots, atomic confirmed booking+notification |
| BE2 | **#32** | Trên `backend/app/` đã có Doctor endpoints: chuyển manual-slot → recurring GET/PUT; Patient Auth booking, availability, statuses/notification; đồng bộ RPC với BE1 |
| FE1 | **#33** | Từ Doctor List PR #30; Patient/Doctor Auth; doctor profile/dashboard/notifications/upcoming |
| FE2 | **#34** | Từ Booking Modal PR #27; shared weekly editor tại registration/dashboard, calendar 30min realtime, booking 201 confirmed |
| Tester | **#35** | Từ #9; tạo test cases ngay, chạy E2E trên DB thật sau tích hợp, báo bugs rõ |
| Lead | **#36** | Đóng API contract tại `docs/API_CONTRACT_V2.md`, chốt ownership file, review PR/integration/PO demo; US-01 không bị bỏ |

## Thứ tự để không đụng nhau

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

**Không dùng issue #21/#22/#8/#19 hoặc role Clinic Staff làm công việc bắt buộc của Doctor US-03 mới.**
