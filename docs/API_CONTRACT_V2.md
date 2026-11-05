# API Contract V2 — Target cập nhật theo Doctor recurring schedule

**Nguồn nghiệp vụ:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i) (ưu tiên) và [Requirements PRD](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.qnrlozg520mq) (nền tảng). **Áp dụng:** định hướng FE/BE cho 6 issue #31–#36; **chưa đồng nghĩa API đang chạy trên main**. API hiện hữu đọc tại `backend/app/main.py`; [legacy/API_CONTRACT.md](legacy/API_CONTRACT.md) là legacy. Xem [DOCS_GUIDE.md](DOCS_GUIDE.md).

## Quyết định tích hợp để giảm thay đổi code US-02

- **Giữ `slotId` cho Patient Booking.** `appointment_slots` là các slot 30 phút **do system tự sinh** từ `doctor_working_hours`; Doctor **không** gọi endpoint tạo/mở slot riêng. BE1 #31 lo SQL/materialization và bảo toàn booking cũ, BE2 #32 lo API.
- Doctor được nhận diện qua Supabase Auth JWT → `doctor_accounts.auth_user_id → doctor_id`. Patient dùng JWT → `patient_profiles`. Không tin ID do FE gửi để cấp quyền. **Không còn clinic staff/assigned-doctor management** trong phạm vi mới.
- Booking được kiểm tra atomically tại DB: Doctor active, trong weekly schedule hiệu lực, slot tương lai, **30 phút**, chưa có appointment chưa hủy; nếu hợp lệ **201 `confirmed`** và tạo **persistent notification** trong cùng transaction. Nếu hai request cùng slot thì chỉ một thành công, request còn lại **409**. Không có trạng thái `requested`/`checked_in` trong luồng mới.
- Doctor schedule có **nhiều khoảng/ngày**, theo `Asia/Ho_Chi_Minh`, các khoảng >=30 phút và bội số 30 phút, không giao nhau. Sửa lịch phải chỉ định `effectiveDate` trong tương lai; nếu gây xung đột appointment `confirmed`, trả 409 và **không áp dụng**, không tự dời/hủy.
- JSON `camelCase`, ISO 8601 kèm offset/Z, DB lưu UTC; 401 thiếu/sai JWT, 403 sai role/ownership, 404 không tìm thấy, 409 conflict, 422 input sai, 503 service unavailable. Không bao giờ báo thành công giả. Secret/service-role chỉ dùng ở backend.

## Endpoints chuẩn mục tiêu

| Method + path | Body / query | Success |
| --- | --- | --- |
| `GET /api/doctors?specialty=&district=` | Public; chỉ doctor active | 200 `{doctors: Doctor[],demoMode:boolean}` |
| `GET /api/doctors/{doctorId}` | Public | 200 `{doctor:Doctor,demoMode:boolean}` |
| `GET /api/doctors/{doctorId}/slots?from=YYYY-MM-DD&to=YYYY-MM-DD` | Public; khoảng ngày hữu hạn; BE tự sinh/đọc các slot 30 phút hiệu lực | 200 `{slots:AvailableSlot[],demoMode:boolean}` |
| `POST /api/appointments` | **Patient Bearer JWT**, `BookingInput` | **201** `{appointmentId,bookingReference,status:"confirmed"}` |
| `GET /api/patient/me` | Patient Bearer JWT | 200 `{patient:{id,name,phone,email}}` |
| `POST /api/auth/patients/register` | `{name,email,phone,password}` | Tạo Auth account + `patient_profiles` liên kết; 201 `{userId}` |
| `POST /api/auth/doctors/register` | `{email,password,invitationCode,weeklyIntervals:WorkingInterval[]}` | Validate one-time invitation gắn **doctor profile có sẵn**; tạo Auth mapping + lịch tuần; 201 `{doctorId}` |
| `GET /api/doctor/me` | Doctor Bearer JWT | 200 `{doctor:DoctorProfile}` |
| `GET /api/doctor/schedule` | Doctor Bearer JWT | 200 `{timezone:"Asia/Ho_Chi_Minh",weeklyIntervals:WorkingInterval[],effectiveDate}` |
| `PUT /api/doctor/schedule` | Doctor Bearer JWT; `{effectiveDate:"YYYY-MM-DD",weeklyIntervals:WorkingInterval[]}` | 200 trả `{effectiveDate,weeklyIntervals}`; 409 `ScheduleConflict` nếu đụng lịch `confirmed` |
| `GET /api/doctor/slots` | Doctor Bearer JWT | 200 `{slots:DoctorSlot[]}` (auto-generated, available/booked; không tạo thủ công) |
| `GET /api/doctor/appointments?view=upcoming` | Doctor Bearer JWT; `upcoming` tùy chọn | 200 `{appointments:DoctorAppointment[]}`; upcoming chỉ future `confirmed` ASC |
| `PATCH /api/doctor/appointments/{id}` | Doctor Bearer JWT; `{status:"completed"|"cancelled"}` | 200 `{appointment:{id,status}}`; chỉ `confirmed → completed/cancelled` |
| `GET /api/doctor/notifications` | Doctor Bearer JWT | 200 `{notifications:DoctorNotification[]}` |
| `PATCH /api/doctor/notifications/{id}` | Doctor Bearer JWT; `{read:true}` | 200 `{notification:{id,readAt}}` |

**Authentication:** Login/logout/session được thực hiện bằng Supabase Auth SDK trên FE cho hai role nhưng phải **tách màn hình/routes**. Hai API đăng ký ở trên là **contract mục tiêu**, chưa có trên main; BE2/BE1 phải thống nhất cách tạo Auth user + profile/schedule/invite an toàn, không được lưu password vào bảng nghiệp vụ hoặc tạo user không gắn profile sau lỗi. FE1/FE2 tích hợp đúng endpoints trên; nếu đổi tên/path, Lead sửa **file này trong cùng PR liên quan**, không chốt qua tin nhắn rời rạc.

## Shared types / payloads (mẫu chính xác)

```ts
type WorkingInterval = { dayOfWeek: number; startTime: string; endTime: string };
// dayOfWeek: 1=Monday ... 7=Sunday; HH:mm theo Asia/Ho_Chi_Minh.
// Ví dụ [{dayOfWeek:1,startTime:"09:00",endTime:"12:00"},
//        {dayOfWeek:1,startTime:"13:00",endTime:"17:00"}]
type AvailableSlot = { id: string; doctorId: string; startAt: string; endAt: string };
type DoctorSlot = AvailableSlot & { available: boolean };
type BookingInput = { slotId: string; patientName: string; patientPhone: string; notes?: string };
type AppointmentStatus = "confirmed" | "completed" | "cancelled";
type ScheduleConflict = {
  error: "SCHEDULE_CONFLICT";
  conflicts: { appointmentId: string; startAt: string; endAt: string }[];
};
type DoctorAppointment = {
  id: string; doctorId: string; patientName: string; patientPhone: string;
  startAt: string; endAt: string; status: AppointmentStatus;
};
type DoctorNotification = {
  id: string; appointmentId: string; patientName: string;
  startAt: string; endAt: string; createdAt: string; readAt: string | null;
};
```

**Patient booking input:** `patientName`/`patientPhone` được prefill từ `/api/patient/me`; backend **phải kiểm tra** JWT và ràng buộc `patient_id` từ token. Không nhận `patientId` để cấp quyền từ body. `slotId` chỉ là định danh khoảng 30 phút do hệ thống tạo; FE không tự tạo ID hoặc tự tính quyền truy cập.

**Doctor registration example:** `{"email":"doctor@example.com","password":"<provided securely>","invitationCode":"<valid code>","weeklyIntervals":[{"dayOfWeek":1,"startTime":"09:00","endTime":"12:00"},{"dayOfWeek":1,"startTime":"13:00","endTime":"17:00"}]}`. Cơ chế cấp invite do Lead/BE1 quyết định; code không được chấp nhận invitation tùy ý hoặc tạo Doctor profile không có sẵn.

**PUT schedule example:** `{"effectiveDate":"2026-11-06","weeklyIntervals":[{"dayOfWeek":1,"startTime":"09:00","endTime":"12:00"}]}`. Với conflict: HTTP 409 và JSON `{"error":"SCHEDULE_CONFLICT","conflicts":[{"appointmentId":"<uuid>","startAt":"<ISO>","endAt":"<ISO>"}]}`. Frontend phải hiển thị conflicts, không tự retry/overwrite.

## Availability, realtime và lỗi

1. Source: weekly intervals + ngày hiệu lực + Doctor active − thời gian quá khứ − mọi appointment chưa hủy. Kết quả chỉ slot **30 phút**, sắp xếp tăng dần. Đơn vị booking là khoảng `[startAt,endAt)`, slot không được trùng/giao nhau cho cùng Doctor.
2. Materialization (quyết định giữ `slotId`): BE1/BE2 tự tạo/cập nhật slot 30 phút bằng transaction/jobs nội bộ **không yêu cầu Doctor publish**. Khi đổi schedule, chỉ bỏ/chặn slot **chưa đặt** không còn phù hợp; không xóa/move lịch `confirmed`. GET phải tránh trả slots seed/legacy ngoài schedule hiệu lực.
3. Realtime: khi booking/cancel/schedule change, BE phát sự kiện thay đổi availability theo Doctor; FE subscription refresh từ GET và fallback refetch khi reconnect. Đích NFR là **~5 giây điều kiện bình thường**, không thay cho kiểm tra nguyên tử trong POST.
4. Notifications: booking thành công phải ghi notification của Doctor **trong cùng giao dịch**; chỉ phát realtime **sau commit**. FE nhận sự kiện/refetch, unread/read trạng thái lưu DB. Booking thất bại không tạo notification.
5. Failed/timeout POST: có thể DB đã commit nhưng FE mất response; **không gửi lặp vô hạn**, tải lại dữ liệu/trạng thái và hướng dẫn kiểm tra trước khi thử lại.
6. Legacy `POST /api/doctor/slots`, `/api/staff/*`, `PATCH /api/appointments/{id}` là **đường code cũ**, không phải mục tiêu mới; chỉ xóa/deprecate sau khi Doctor flow mới chạy và regression pass. Không dùng clinic staff làm role P0.

## Handoff đúng chỗ

- **BE1 #31:** `supabase/migrations/`, schema target, doctor_working_hours/materialization, patient/doctor Auth mapping & invitations, status constraints, booking+notification transactional safety.
- **BE2 #32:** `backend/app/main.py`, `service.py`, `schemas.py`; triển khai các target HTTP routes/bodies/responses/error như bảng trên. **Chốt contract = cập nhật đúng bảng và mẫu JSON ở file này trong PR, rồi Lead #36 review**.
- **FE1 #33:** Patient/Doctor Auth, Doctor List, Doctor Dashboard/appointments/notifications; **FE2 #34**: shared weekly editor + patient booking calendar/modal. **Tester #35**: contract + E2E theo [ACCEPTANCE_SCENARIO](ACCEPTANCE_SCENARIO.md).
