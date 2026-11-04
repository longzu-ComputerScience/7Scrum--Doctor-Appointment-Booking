# Definition of Done — Updated Doctor workflow

**Nghiệp vụ:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i); **API** [API_CONTRACT_V2](API_CONTRACT_V2.md); **data** [DATA_DICTIONARY](DATA_DICTIONARY.md). Không đánh dấu Done từ CI/mock đơn thuần.

- [ ] **Auth:** Patient self-register/login/profile + Doctor invitation-register/login/weekly setup; FE/BE phân quyền đúng JWT và doctor_id; không login giả.
- [ ] **US-01:** chatbot follow-up/specialty/emergency/fallback kết nối Doctor List thật.
- [ ] **US-02:** Doctor List active/filtered; Patient calendar lấy generated 30-minute slots, đúng múi giờ và realtime; booking lưu thật HTTP 201 `confirmed` + reference; duplicate 409; popup không fake success.
- [ ] **US-03:** Doctor weekly schedule một/nhiều khoảng giờ theo thứ; auto slot, không manual publish; PUT effectiveDate future và 409 conflicts, giữ mọi confirmed appointment.
- [ ] **Doctor dashboard:** Upcoming future confirmed, status `confirmed→completed/cancelled`, notification record + realtime/unread/mark-read/persist sau refresh.
- [ ] **DB integrity:** shared Supabase có migration mới được kiểm chứng, data-preserving cutover, notification + booking atomic, không overlap Doctor/time, ownership đúng Patient/Doctor.
- [ ] **QA:** test 401/403/404/409/422/503, concurrency, timeout, refresh/reconnect, date/time conversion, notification atomic, schedule conflict; có logs/screenshot/DB evidence.
- [ ] **Code review:** named human reviewer, FE lint/typecheck/build và BE Ruff/pytest trên integrated commit; không có critical P0 blocker.
- [ ] **PO:** chạy [Acceptance Scenario](ACCEPTANCE_SCENARIO.md), PO xác nhận kết quả thật; không tự gắn Accepted.

Không thêm manual slot publishing, clinic staff admin, patient self-cancel/reschedule, SMS/email, payment hay production deployment cho MVP này.
