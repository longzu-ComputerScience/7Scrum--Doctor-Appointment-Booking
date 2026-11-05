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
| `GET /api/auth/me` | Patient/Doctor Bearer JWT | 200 `{role:"patient",patient:PatientProfile}` hoặc `{role:"doctor",doctor:DoctorProfile}`; vai trò lấy từ DB sau khi xác thực JWT |
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

**Authentication:** Hai role dùng màn hình riêng và dùng Supabase Auth SDK để đăng nhập, đăng xuất và làm mới phiên. Theo yêu cầu cập nhật, API đăng ký tạo Auth user với `email_confirm: true`; người dùng không cần nhận hoặc bấm email xác nhận. Sau HTTP 201, FE đăng nhập bằng email/mật khẩu và chuyển về portal đúng vai trò. Nếu tự đăng nhập thất bại, giao diện vẫn xác nhận tài khoản đã tạo và cho phép đăng nhập lại. Doctor dùng mã mời gắn đúng email và hồ sơ có sẵn. Migration `005` của BE1 lưu liên kết Doctor, lịch ban đầu và trạng thái đã dùng của invite trong cùng giao dịch. Khi RPC xác nhận giao dịch bị từ chối, API xóa Auth user vừa tạo. Nếu mất kết nối và chưa xác định được giao dịch đã commit hay chưa, API trả 503 để vận hành đối soát theo Auth UID trước khi thử lại.

Frontend dùng `/api/auth/me` để khôi phục phiên và chuyển đúng portal. Không dùng `user_metadata` hoặc vai trò người dùng tự gửi để cấp quyền. Tài khoản Auth chưa có hồ sơ app trả 403; lỗi Auth/DB trả 503, không tự gán vai trò. Luồng đăng ký không gửi email xác nhận hoặc yêu cầu URL callback email. Migration `006` bổ sung RPC cấp mã mời chỉ cho `service_role`; xem [AUTH_SETUP.md](AUTH_SETUP.md).

**Khoảng ngày:** `from` và `to` tính cả hai đầu theo ngày Việt Nam. Mặc định từ hôm nay đến hôm nay + 30 ngày. Tối đa 31 ngày lịch mỗi request. RPC chỉ sinh slot trong cửa sổ đặt lịch 31 ngày sắp tới. `GET /api/doctor/slots` dùng cùng cửa sổ và có cả slot đã bị chiếm.

**Lịch tuần:** `GET /api/doctor/schedule` trả phiên bản có ngày hiệu lực xa nhất đã lưu, kể cả lịch sắp áp dụng. Nếu Doctor đã có tài khoản nhưng chưa cấu hình lịch, API trả 404 và FE có thể mở form tạo lịch. `PUT` yêu cầu ngày tương lai theo giờ Việt Nam. Nếu đã có phiên bản cùng ngày, API trả 409 `{error:"Schedule date already in use"}`.

**Dashboard:** Mỗi lần đọc trả tối đa 100 lịch hẹn hoặc 100 thông báo. `view=upcoming` sắp xếp từ lịch gần nhất theo giờ bắt đầu. Danh sách lịch hẹn mặc định và thông báo sắp xếp mới nhất theo thời điểm tạo.

### Lỗi theo route

| Method + path | HTTP lỗi |
| --- | --- |
| `GET /api/doctors` | 422 bộ lọc sai, 503 lỗi đọc catalog |
| `GET /api/doctors/{doctorId}` | 404 Doctor không tồn tại hoặc inactive, 422 ID sai, 503 lỗi đọc catalog |
| `GET /api/doctors/{doctorId}/slots` | 404 Doctor không tồn tại hoặc inactive, 422 ID/khoảng ngày sai, 503 lỗi RPC hoặc DB |
| `POST /api/appointments` | 401/403, 409 slot đã bị chiếm hoặc hết hiệu lực, 422 body sai, 503 lỗi Auth/RPC/DB |
| `GET /api/patient/me` và `GET /api/doctor/me` | 401/403, 503 lỗi Auth/DB |
| `POST /api/auth/patients/register` | 409 tài khoản đã tồn tại, 422 body sai, 503 lỗi Auth/RPC/DB |
| `POST /api/auth/doctors/register` | 403 mã mời sai email, hết hạn hoặc đã dùng, 409 tài khoản/hồ sơ đã liên kết hoặc lịch xung đột, 422 body sai, 503 lỗi Auth/RPC/DB |
| `GET /api/doctor/schedule` | 401/403, 404 chưa có lịch, 503 lỗi Auth/DB |
| `PUT /api/doctor/schedule` | 401/403, 409 trùng ngày hiệu lực hoặc xung đột với lịch hẹn, 422 body sai, 503 lỗi Auth/RPC/DB |
| `GET /api/doctor/slots` và `GET /api/doctor/notifications` | 401/403, 503 lỗi Auth/DB |
| `GET /api/doctor/appointments` | 401/403, 422 `view` sai, 503 lỗi Auth/DB |
| `PATCH /api/doctor/appointments/{id}` | 401/403, 404 lịch hẹn không tồn tại, 409 trạng thái hiện tại không phải `confirmed`, 422 ID/body sai, 503 lỗi Auth/RPC/DB |
| `PATCH /api/doctor/notifications/{id}` | 401/403, 404 notification không thuộc Doctor hoặc không tồn tại, 422 ID/body sai, 503 lỗi Auth/RPC/DB |

401 là thiếu JWT hoặc phiên sai/hết hạn. 403 trên route có JWT là sai vai trò hoặc thiếu quyền trên tài nguyên. Lỗi nghiệp vụ thông thường trả `{error:string}`. Lỗi validation của FastAPI có thêm `detail:[{loc,msg,type}]` để FE gắn lỗi vào field.

## Shared types / payloads (mẫu chính xác)

```ts
type WorkingInterval = { dayOfWeek: number; startTime: string; endTime: string };
// dayOfWeek: 1=Monday ... 7=Sunday; HH:mm theo Asia/Ho_Chi_Minh.
// 24:00 chỉ dùng cho endTime.
// Ví dụ [{dayOfWeek:1,startTime:"09:00",endTime:"12:00"},
//        {dayOfWeek:1,startTime:"13:00",endTime:"17:00"}]
type AvailableSlot = { id: string; doctorId: string; startAt: string; endAt: string };
type DoctorSlot = AvailableSlot & { available: boolean };
type Doctor = {
  id: string; name: string; specialty: string; bio: string; address: string; district: string;
  certificates: { name: string; issuer: string; issuedYear: number | null; credentialUrl: string | null }[];
  rating: number | null; ratingCount: number;
};
type DoctorProfile = { id: string; name: string; specialty: string; active: boolean };
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

**Patient booking input:** Điền sẵn `patientName` và `patientPhone` từ `/api/patient/me` và gửi theo contract US-02. RPC chụp tên và điện thoại từ `patient_profiles` của Auth UID đã xác thực. `slotId` lấy từ GET availability và `notes` là ghi chú tùy chọn.

**Doctor registration example:** `{"email":"doctor@example.com","password":"<provided securely>","invitationCode":"<valid code>","weeklyIntervals":[{"dayOfWeek":1,"startTime":"09:00","endTime":"12:00"},{"dayOfWeek":1,"startTime":"13:00","endTime":"17:00"}]}`. Cơ chế cấp invite do Lead/BE1 quyết định; code không được chấp nhận invitation tùy ý hoặc tạo Doctor profile không có sẵn.

**PUT schedule example:** `{"effectiveDate":"2026-11-06","weeklyIntervals":[{"dayOfWeek":1,"startTime":"09:00","endTime":"12:00"}]}`. Với conflict: HTTP 409 và JSON `{"error":"SCHEDULE_CONFLICT","conflicts":[{"appointmentId":"<uuid>","startAt":"<ISO>","endAt":"<ISO>"}]}`. Frontend phải hiển thị conflicts, không tự retry/overwrite.

## Availability, realtime và lỗi

1. Source: weekly intervals + ngày hiệu lực + Doctor active − thời gian quá khứ − mọi appointment chưa hủy. Kết quả chỉ slot **30 phút**, sắp xếp tăng dần. Đơn vị booking là khoảng `[startAt,endAt)`, slot không được trùng/giao nhau cho cùng Doctor.
2. Materialization (quyết định giữ `slotId`): BE1/BE2 tự tạo/cập nhật slot 30 phút bằng transaction/jobs nội bộ **không yêu cầu Doctor publish**. Khi đổi schedule, chỉ bỏ/chặn slot **chưa đặt** không còn phù hợp; không xóa/move lịch `confirmed`. GET phải tránh trả slots seed/legacy ngoài schedule hiệu lực.
3. Realtime calendar: sau khi đăng nhập, subscribe Supabase Postgres Changes trên `public.doctor_calendar_revisions`, filter `doctor_id=eq.<doctorId>`, event `INSERT`/`UPDATE`. Tải lại GET availability sau event và mỗi lần channel báo `SUBSCRIBED`, kể cả reconnect. Lịch public vẫn xem được bằng GET trước khi đăng nhập. Mục tiêu đo được là **~5 giây trong điều kiện bình thường**.
4. Doctor dashboard: subscribe `public.appointment_notifications` với filter Doctor tương tự và JWT Doctor. Sau event hoặc reconnect, tải lại GET notifications và GET appointments với `view=upcoming`. Theo dõi thêm `doctor_calendar_revisions` để làm mới upcoming khi trạng thái lịch hẹn đổi. Bảng notifications có RLS theo Doctor, và chi tiết booking lấy từ API. Booking, notification và revision chỉ xuất hiện sau cùng một commit. `PATCH` đọc thông báo giữ nguyên thời điểm đọc đầu tiên.
5. Failed/timeout POST: có thể DB đã commit nhưng FE mất response; **không gửi lặp vô hạn**, tải lại dữ liệu/trạng thái và hướng dẫn kiểm tra trước khi thử lại.
6. Legacy `POST /api/doctor/slots`, `/api/staff/*`, `PATCH /api/appointments/{id}` là **đường code cũ**, không phải mục tiêu mới; chỉ xóa/deprecate sau khi Doctor flow mới chạy và regression pass. Không dùng clinic staff làm role P0.

## Ví dụ HTTP cho FE và QA

Lấy UUID thật từ response trước khi gọi bước tiếp theo. Các UUID dưới đây là minh họa.

```http
GET /api/doctors/10000000-0000-4000-8000-000000000001/slots?from=2026-11-06&to=2026-11-08

HTTP/1.1 200 OK
{"slots":[{"id":"30000000-0000-4000-8000-000000000109","doctorId":"10000000-0000-4000-8000-000000000001","startAt":"2026-11-06T02:00:00Z","endAt":"2026-11-06T02:30:00Z"}],"demoMode":false}

POST /api/appointments
Authorization: Bearer <patient-jwt>
Content-Type: application/json

{"slotId":"30000000-0000-4000-8000-000000000109","patientName":"Demo Patient","patientPhone":"0900000000","notes":""}

HTTP/1.1 201 Created
{"appointmentId":"50000000-0000-4000-8000-000000000001","bookingReference":"A1B2C3D4E5F6","status":"confirmed"}

HTTP/1.1 409 Conflict
{"error":"Slot is no longer available"}

PUT /api/doctor/schedule
Authorization: Bearer <doctor-jwt>
Content-Type: application/json

{"effectiveDate":"2026-11-06","weeklyIntervals":[{"dayOfWeek":5,"startTime":"13:00","endTime":"17:00"}]}

HTTP/1.1 409 Conflict
{"error":"SCHEDULE_CONFLICT","conflicts":[{"appointmentId":"50000000-0000-4000-8000-000000000001","startAt":"2026-11-06T02:00:00Z","endAt":"2026-11-06T02:30:00Z"}]}

PATCH /api/doctor/notifications/60000000-0000-4000-8000-000000000001
Authorization: Bearer <doctor-jwt>
Content-Type: application/json

{"read":true}

HTTP/1.1 200 OK
{"notification":{"id":"60000000-0000-4000-8000-000000000001","readAt":"2026-11-04T10:30:00Z"}}
```

### Smoke test trên Supabase test

Sau khi BE1 áp dụng migration `005`, dùng mã mời và hồ sơ Doctor thử nghiệm, hai Patient và một Doctor khác để kiểm tra quyền. Cấu hình URL và service-role key chỉ trong môi trường backend.

1. Đăng ký Doctor và đăng nhập ngay, kiểm tra `GET /api/doctor/schedule` và lấy slot 30 phút từ availability. Đăng ký Patient, đăng nhập ngay và đối chiếu `GET /api/patient/me`. Không xác nhận email hoặc cập nhật tài khoản bằng Admin API giữa đăng ký và đăng nhập.
2. Dùng hai Patient JWT gửi đồng thời cùng một `slotId`. Xác minh đúng một HTTP 201, một HTTP 409, một booking `confirmed` và một notification trong DB. Kiểm tra JWT thiếu/sai và JWT Doctor gọi booking.
3. Kiểm tra notification và upcoming của đúng Doctor. Dùng Doctor khác gọi PATCH để kiểm tra quyền. Gửi lại PATCH đọc cùng notification và đối chiếu `readAt`.
4. Đổi lịch khiến slot đã đặt nằm ngoài giờ làm. Xác minh 409 và GET vẫn trả phiên bản trước. Hủy lịch hẹn, kiểm tra slot xuất hiện lại nếu còn đủ điều kiện và kiểm tra cập nhật calendar/dashboard khi reconnect.

## Handoff đúng chỗ

- **BE1 #31:** `supabase/migrations/`, schema target, doctor_working_hours/materialization, patient/doctor Auth mapping & invitations, status constraints, booking+notification transactional safety.
- **BE2 #32:** `backend/app/main.py`, `service.py`, `schemas.py`; triển khai các target HTTP routes/bodies/responses/error như bảng trên. **Chốt contract = cập nhật đúng bảng và mẫu JSON ở file này trong PR, rồi Lead #36 review**.
- **FE1 #33:** Patient/Doctor Auth, Doctor List, Doctor Dashboard/appointments/notifications; **FE2 #34**: shared weekly editor + patient booking calendar/modal. **Tester #35**: contract + E2E theo [ACCEPTANCE_SCENARIO](ACCEPTANCE_SCENARIO.md).
