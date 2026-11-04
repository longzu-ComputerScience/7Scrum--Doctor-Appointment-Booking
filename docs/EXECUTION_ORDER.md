# Thứ tự triển khai — TODAY-US2 → TODAY-US3

**Nguồn nghiệp vụ:** [PO SMART HOSPITAL, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8). **Đích kỹ thuật:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql). Xem [DOCS_GUIDE.md](DOCS_GUIDE.md) trước khi chuyển từ V1 sang V2.

**Chỉ có các issue `[TODAY-US2]` và `[TODAY-US3]` còn mở.** Các issue #1/#2/#4/#8/#10/#18/#19/#20/#21/#22… đã đóng để dọn backlog; không đồng nghĩa đã nghiệm thu. Không mở lại hoặc giao việc dựa trên bảng D1-A/D1-B cũ.

## Công việc tiếp nối theo đúng 6 vai trò

| Vai trò | Tiếp tục từ US-02 | US-03 hiện hành | Đầu ra |
| --- | --- | --- | --- |
| BE1 | #3 | **#31** | Audit DB thực tế, migration V1→V2 có bảo toàn dữ liệu, staff membership, constraints/RPC |
| BE2 | #26 (PR #28 đã merge) | **#32** | Staff doctors/slots/appointments API, doctor-scoped JWT, bổ sung V2 contract cùng Lead |
| FE1 | #5 (PR #30 đã merge) | **#33** | Staff appointments + confirmed view, đúng V2 fields |
| FE2 | #7 (đã đóng; PR #27 merge) | **#34** | Staff tạo/xem slot, không bỏ mất patient booking flow |
| Tester | #9 | **#35** | US-02 booking + US-03 sync/auth/concurrency, bằng chứng trên DB chung |
| Lead | #25 | **#36** | Quyết định PO/contract, điều phối tích hợp, review, demo và sign-off |

## Trình tự phụ thuộc, có thể làm song song

1. **Lead #36 + BE1 #31 + BE2 #32:** xác minh runtime/schema hiện tại, chốt V2 doctor-scoped permission, bổ sung staff schedule endpoints, thống nhất với PO về `requested → confirmed` và vai trò clinic staff/doctor (xem [DOCS_GUIDE.md](DOCS_GUIDE.md)).
2. **BE1/BE2 song song:** kiểm tra migration và triển khai FastAPI theo contract đã chốt. Không coi `schema_v2.sql` là migration trên DB đang có V1; không sửa/đè SQL production khi chưa audit/backup.
3. **FE1 #33, FE2 #34 song song:** xây UI tách component trước; tích hợp API theo V2 sau khi chốt contract. Giữ luồng US-02 Doctor List → real slots → booking; không hiển thị xác nhận giả.
4. **Tester #9/#35:** chuẩn bị test case ngay; chỉ báo pass sau test thật trên cùng DB: auth, 201/409, requested slot unavailable, staff confirm, UTC/+07, 422/503, E2E. Lead #25/#36 tổng hợp PO review.
5. **US-01:** dù các issue cũ đã đóng, chatbot + emergency/fallback + specialty navigation vẫn là P0 của PO; Lead kiểm tra và phân công phần còn thiếu trong phạm vi hiện hành.

```text
US-02 existing: BE1 #3 + BE2 #26 + FE1 #5 + FE2 PR #27
                                |
                  V2 design & DB/API alignment
                                v
            BE1 #31  <---->  BE2 #32  + Lead #36
                    |                 |
                FE2 #34           FE1 #33
                    \                 /
                     --> Tester #35 --
                                |
                      Lead #36 / PO acceptance
```

**Nguyên tắc Git:** Phần US-02 chưa xong tiếp tục trong PR tương ứng; phần US-03 tạo PR riêng từ base phù hợp để tránh trộn việc. Chỉ merge sau khi review/CI và thống nhất API. Không đổi scope của checklist TODAY khi không có quyết định PO/Lead.
