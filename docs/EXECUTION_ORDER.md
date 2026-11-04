# Thứ tự triển khai Issues — 7Scrum (2 ngày)

**Nguồn yêu cầu:** PO Google Doc và [3 User Stories](USER_STORIES.md). **Mục tiêu:** Hoàn thành 6 bước demo Dermatology. `P0` nghĩa là bắt buộc; **D1-A / D1-B / D2-A / D2-B** mới chỉ *thời điểm ưu tiên*, không phải số thứ tự cứng của từng developer.

> **Mở issue theo nhãn `stage:D1-A` trước.** Các thành viên làm song song theo vai trò. Chỉ chờ dependency ở bước **tích hợp**, không cần chờ để dựng UI hoặc viết test cases.

## D1-A — Ngày 1, bắt đầu ngay

| Vai trò | Issue | Kết quả cần bàn giao |
| --- | --- | --- |
| BA 1 | [#1](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/1) | Chốt scope và Acceptance Criteria của US-01/02/03 |
| BA 2 | [#2](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/2) | Dữ liệu mẫu bác sĩ/clinic/specialty thống nhất với backend |
| Backend / Tech Lead | [#21](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/21) | API staff tạo/xem slot và kiểm tra quyền clinic |
| Frontend 1 | [#18](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/18) | Chat UI, câu hỏi follow-up, trạng thái gợi ý specialty |
| Frontend 2 | [#22](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/22) | Form nhân viên chọn bác sĩ và nhập slot |

QA **bắt đầu viết test cases cho #9** ngay từ D1-A, dù chạy integration test thật ở D2-A.

## D1-B — Ngày 1, hoàn thiện core và tích hợp dần

| Vai trò | Issue | Chỉ cần chờ khi tích hợp |
| --- | --- | --- |
| Backend / Tech Lead | [#3](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/3) → [#4](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/4) | Booking cần slot thật từ #21; chatbot API độc lập |
| Frontend 1 | [#5](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/5) | Chatbot #18 và specialty API #4 |
| Frontend 2 | [#7](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/7) → [#8](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/8) | Slot #21 và booking #3; #8 cần lịch đã đặt |

**Nguyên tắc:** FE1 vẫn có thể hoàn thiện giao diện khi BE chưa xong API. FE2 có thể làm booking UI song song với backend. Không đánh dấu issue Done trước khi tích hợp dữ liệu thật.

## D2-A — Ngày 2, kiểm thử tích hợp

| Vai trò | Issue | Yêu cầu kiểm chứng |
| --- | --- | --- |
| QA | [#9](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/9) | Supabase thật: create slot, double-booking 201/409, JWT/clinic permissions |
| QA | [#19](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/19) | Staff tạo slot → patient thấy slot → booking → staff thấy slot đã đặt |
| BA 2 | [#13](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/13) | Kịch bản Dermatology, tài khoản demo, hướng dẫn chạy, bằng chứng |

BA 2 có thể **soạn trước #13 từ Day 1**; chỉ kết thúc khi môi trường demo hoạt động.

## D2-B — Ngày 2, hoàn tất sprint

| Vai trò | Issue | Chỉ đóng khi |
| --- | --- | --- |
| QA | [#10](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/10) | Cả 6 bước Dermatology E2E pass, không còn critical blocker |
| BA 1 + PO | [#20](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/20) | Đủ DoD/test evidence, human review và PO sign-off thật |

## P1 — Chỉ sau khi P0 chạy end-to-end

| Issue | Hạng mục |
| --- | --- |
| [#6](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/6) | Lọc theo địa điểm nâng cao |
| [#11](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/11) | Vercel preview / triển khai tùy chọn |
| [#12](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/12) | Rà soát copy và future scope |
| [#15](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/15) | Responsive/UI polish nâng cao |

## Dependency trực quan

```text
BA2 #2 (sample data)
    └── BE #21 (doctor slot API) ──> FE2 #22 (staff create slot)
             │                             │
             └──> BE #3 (atomic booking) --> FE2 #7 (booking UI) --> FE2 #8 (clinic list)
                                              │                       │
FE1 #18 (chat UI) + BE #4 (chat API) --> FE1 #5 (doctor selection)    │
                 │                            │                       │
                 └────────────────────────────┴───────────────────────┘
                                              ↓
                            QA #9 + #19 (DB/integration checks)
                                              ↓
                    QA #10 (6-step E2E) + BA2 #13 (demo)
                                              ↓
                            BA1 #20 + PO (final sign-off)
```

## Quy tắc đặt tên và đọc issue

- Tiêu đề: `[GIAI-ĐOẠN][VAI-TRÒ][US-xx] Công việc`, ví dụ `[D1-A][BE][US-03] API tạo và đọc slot bác sĩ`.
- Nhãn: giữ nguyên `P0/P1` và `role:...`, thêm một nhãn `stage:...`.
- **`#21` không phải công việc thứ 21.** Issue number chỉ là GitHub ID, không quyết định thứ tự.
- Đọc phần **Execution order** ở đầu issue: *When, Prerequisites, Unlocks, Next action*.
- Các issue cùng stage có thể làm đồng thời. **Không đóng issue chỉ vì code skeleton đã có:** phải thỏa AC, test và Dev review theo [Definition of Done](DEFINITION_OF_DONE.md).

## Hành động ngay

BA1 nhận #1; BA2 nhận #2; Backend/Tech Lead ưu tiên #21; FE1 nhận #18; FE2 nhận #22; QA bắt đầu thiết kế các trường hợp test #9. Sau khi API/contract ổn, chuyển sang D1-B tương ứng.
