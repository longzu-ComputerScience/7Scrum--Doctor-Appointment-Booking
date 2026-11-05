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
| `POST /api/consult` | Public; `{messages:string[]}` | 200 `ConsultationResult` (US-01) |
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

**Authentication:** Hai role dùng màn hình riêng và dùng Supabase Auth SDK để đăng nhập, đăng xuất và làm mới phiên. API đăng ký tạo Auth user chưa xác nhận email. Sau HTTP 201, FE gọi `supabase.auth.resend({type:"signup",email})` và hướng dẫn xác nhận email trước khi đăng nhập. Doctor dùng mã mời gắn đúng email và hồ sơ có sẵn. Migration `005` của BE1 lưu liên kết Doctor, lịch ban đầu và trạng thái đã dùng của invite trong cùng giao dịch. Khi RPC xác nhận giao dịch bị từ chối, API xóa Auth user vừa tạo. Nếu mất kết nối và chưa xác định được giao dịch đã commit hay chưa, API trả 503 để vận hành đối soát theo Auth UID trước khi thử lại.

Frontend dùng `/api/auth/me` để khôi phục phiên và chuyển đúng portal. Không dùng `user_metadata` hoặc vai trò người dùng tự gửi để cấp quyền. Tài khoản Auth chưa có hồ sơ app trả 403; lỗi Auth/DB trả 503, không tự gán vai trò. Frontend chuyển email xác nhận về `/{role}/login` trên origin hiện tại; cấu hình URL này trong Supabase Redirect URLs. Migration `006` bổ sung RPC cấp mã mời chỉ cho `service_role`; xem [AUTH_SETUP.md](AUTH_SETUP.md).

**Khoảng ngày:** `from` và `to` tính cả hai đầu theo ngày Việt Nam. Mặc định từ hôm nay đến hôm nay + 30 ngày. Tối đa 31 ngày lịch mỗi request. RPC chỉ sinh slot trong cửa sổ đặt lịch 31 ngày sắp tới. `GET /api/doctor/slots` dùng cùng cửa sổ và có cả slot đã bị chiếm.

**Lịch tuần:** `GET /api/doctor/schedule` trả phiên bản có ngày hiệu lực xa nhất đã lưu, kể cả lịch sắp áp dụng. Nếu Doctor đã có tài khoản nhưng chưa cấu hình lịch, API trả 404 và FE có thể mở form tạo lịch. `PUT` yêu cầu ngày tương lai theo giờ Việt Nam. Nếu đã có phiên bản cùng ngày, API trả 409 `{error:"Schedule date already in use"}`.

**Dashboard:** Mỗi lần đọc trả tối đa 100 lịch hẹn hoặc 100 thông báo. `view=upcoming` sắp xếp từ lịch gần nhất theo giờ bắt đầu. Danh sách lịch hẹn mặc định và thông báo sắp xếp mới nhất theo thời điểm tạo.

### Lỗi theo route

| Method + path | HTTP lỗi |
| --- | --- |
| `POST /api/consult` | 422 body sai, 503 lỗi đọc catalog. Lỗi AI trả 200 với fallback. |
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

## US-01 — Tư vấn và tìm chuyên khoa

`POST /api/consult` là endpoint dùng cho hội thoại US-01 trên UI. Mỗi request gửi lại các tin nhắn của bệnh nhân theo thứ tự, gồm 1–4 chuỗi. Mỗi chuỗi có tối đa 800 ký tự trước khi trim và ít nhất 2 ký tự sau khi trim. Backend xử lý hội thoại theo request.

```ts
type ConsultationResult = {
  reply: string;
  followUpRequired: boolean;
  specialty: string | null;
  doctors: Doctor[];
  urgent: boolean;
  usedAI: boolean;
  mode: "follow-up" | "emergency" | "rule-based" | "ai-assisted";
  demoMode: boolean;
};
```

- `follow-up` yêu cầu FE hiển thị ô nhập câu trả lời. Lượt sau gửi cả triệu chứng ban đầu lẫn câu trả lời.
- `emergency` được kiểm tra trên toàn bộ lịch sử trước khi hỏi thêm, gọi AI hoặc truy vấn catalog. Khi `urgent=true`, FE chỉ hiển thị hướng dẫn khẩn cấp và ẩn CTA tìm bác sĩ/đặt khám.
- `rule-based` dùng quy tắc cho kịch bản đã hỗ trợ. Nếu chưa có kết quả từ quy tắc, AI có thể đề xuất chuyên khoa trong tập nhãn catalog hiện tại. Thiếu key, timeout, lỗi HTTP hoặc output AI không hợp lệ dùng câu trả lời có kiểm soát với `usedAI=false`. Khi chưa đủ thông tin để gợi ý, `specialty=null` và FE cho phép bắt đầu lại.
- `ai-assisted` và `usedAI=true` nghĩa là chuyên khoa hợp lệ được chọn từ bộ lọc do AI đề xuất. Câu trả lời do backend tạo để hướng người dùng đến chuyên khoa. Hồ sơ bác sĩ đến từ catalog, dùng cùng kiểu `Doctor` như `GET /api/doctors`.
- Catalog lọc bác sĩ active theo chuyên khoa đã chọn và quận/huyện được nhận diện từ lời bệnh nhân, nếu có. Trong tối đa 100 kết quả do catalog trả về, luồng tư vấn chỉ giữ các bác sĩ có nhãn chuyên khoa trùng sau khi chuẩn hóa dấu và hoa thường. Khi kết quả rỗng, giữ `specialty` và hiển thị empty state với `doctors=[]`. Nếu thiếu cấu hình Supabase ở bước tra catalog, `demoMode=true`, `doctors=[]` và FE hiển thị thông báo về cấu hình catalog. `demoMode=false` cũng được dùng ở các lượt chưa tra catalog.

### Mẫu HTTP US-01 cho FE1 và QA

Các response dưới đây lấy từ FastAPI TestClient. Ca có bác sĩ và ca catalog rỗng dùng catalog mock. Ca timeout dùng provider mock.

Lượt 1 hỏi thêm

```http
POST /api/consult
Content-Type: application/json

{"messages":["Tôi bị nổi mẩn đỏ"]}

HTTP/1.1 200 OK
Content-Type: application/json

{"reply":"Triệu chứng này bắt đầu từ khi nào? Bạn có thể bổ sung thời gian hoặc mức độ khó chịu.","followUpRequired":true,"specialty":null,"doctors":[],"urgent":false,"usedAI":false,"mode":"follow-up","demoMode":false}
```

Lượt 2 tìm thấy kết quả trong catalog mock

```http
POST /api/consult
Content-Type: application/json

{"messages":["Tôi bị nổi mẩn đỏ","Khoảng hai ngày nay"]}

HTTP/1.1 200 OK
Content-Type: application/json

{"reply":"Bạn có thể tham khảo chuyên khoa Da liễu. Đây không phải chẩn đoán y khoa.","followUpRequired":false,"specialty":"Da liễu","doctors":[{"id":"10000000-0000-4000-8000-000000000047","name":"Bác sĩ fixture Da liễu","specialty":"Da liễu","bio":"","address":"Địa chỉ fixture","district":"Thủ Đức","certificates":[],"rating":null,"ratingCount":0}],"urgent":false,"usedAI":false,"mode":"rule-based","demoMode":false}
```

Khẩn cấp nằm ở tin đầu

```http
POST /api/consult
Content-Type: application/json

{"messages":["Tôi bị ĐAU NGỰC   DỮ DỘI","Đã hai ngày"]}

HTTP/1.1 200 OK
Content-Type: application/json

{"reply":"Hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất.","followUpRequired":false,"specialty":null,"doctors":[],"urgent":true,"usedAI":false,"mode":"emergency","demoMode":false}
```

Provider timeout ở kịch bản ngoài quy tắc

```http
POST /api/consult
Content-Type: application/json

{"messages":["Da của tôi xuất hiện một vùng đỏ","Khoảng hai ngày nay"]}

HTTP/1.1 200 OK
Content-Type: application/json

{"reply":"Chưa đủ thông tin để gợi ý chuyên khoa. Bạn có thể bắt đầu lại và mô tả rõ hơn triệu chứng.","followUpRequired":false,"specialty":null,"doctors":[],"urgent":false,"usedAI":false,"mode":"rule-based","demoMode":false}
```

Catalog mock không có kết quả theo khu vực

```http
POST /api/consult
Content-Type: application/json

{"messages":["Tôi bị nổi mẩn đỏ","Hai ngày nay, tôi ở Bình Thạnh"]}

HTTP/1.1 200 OK
Content-Type: application/json

{"reply":"Bạn có thể tham khảo chuyên khoa Da liễu. Đây không phải chẩn đoán y khoa. Chưa có bác sĩ phù hợp trong danh mục.","followUpRequired":false,"specialty":"Da liễu","doctors":[],"urgent":false,"usedAI":false,"mode":"rule-based","demoMode":false}
```

Thiếu cấu hình Supabase

```http
POST /api/consult
Content-Type: application/json

{"messages":["Tôi bị nổi mẩn đỏ","Khoảng hai ngày nay"]}

HTTP/1.1 200 OK
Content-Type: application/json

{"reply":"Bạn có thể tham khảo chuyên khoa Da liễu. Đây không phải chẩn đoán y khoa. Danh mục bác sĩ thật chưa được cấu hình trong môi trường này.","followUpRequired":false,"specialty":"Da liễu","doctors":[],"urgent":false,"usedAI":false,"mode":"rule-based","demoMode":true}
```

Tin nhắn chỉ có khoảng trắng

```http
POST /api/consult
Content-Type: application/json

{"messages":["  "]}

HTTP/1.1 422 Unprocessable Entity
Content-Type: application/json

{"error":"Invalid input","detail":[{"loc":["body","messages"],"msg":"Value error, Each message must be 2-800 characters","type":"value_error"}]}
```

### Đối chiếu BE1 #46 trên Supabase test

[PR #53 của BE1](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/pull/53) ghi mapping `Dermatology → Da liễu`, `General Medicine → Nội tổng quát` và báo cáo audit chỉ đọc ngày 05/11/2026. Fixture da liễu là `10000000-0000-4000-8000-000000000001`, với `specialty=Da liễu` và `active=true` tại thời điểm audit. PR đang mở và mục bàn giao chính thức vẫn chờ xác nhận.

**Kết quả BE2 trên Supabase test ngày 05/11/2026: PASS.** FastAPI TestClient chạy trên working tree `feat/issue-47` (commit nền `804a8ef`), dùng Supabase client kết nối đến project test đã cấu hình và tắt AI cho lần chạy. `GET /api/health` trả HTTP 200 với `databaseConfigured=true`.

| Kiểm tra | Kết quả ghi nhận trên Supabase test |
| --- | --- |
| `POST /api/consult`, lượt 1 | HTTP 200, `followUpRequired=true`, `specialty=null`, `mode="follow-up"`, `doctors=[]`. |
| `POST /api/consult`, lượt 2 | HTTP 200, `followUpRequired=false`, `specialty="Da liễu"`, `demoMode=false`, `usedAI=false`, `mode="rule-based"`. Trả 3 bác sĩ, trong đó fixture `10000000-0000-4000-8000-000000000001` có `specialty="Da liễu"`. |
| Đọc `id,specialty,active` từ `public.doctors` theo UUID fixture | Một dòng `{"id":"10000000-0000-4000-8000-000000000001","specialty":"Da liễu","active":true}`. ID và chuyên khoa trùng với lượt 2. |

**Bằng chứng API cục bộ cho Lead.** Chạy TestClient trên working tree `feat/issue-47` (commit nền `804a8ef`). Dữ liệu lấy từ `supabase/seed.sql` theo fixture của PR #53. Backend chạy qua catalog service và Supabase client, với HTTP mock tại PostgREST. Cả 9 request PostgREST đều là `GET /rest/v1/doctors` có bộ lọc `active=eq.true`.

| Ca | Kết quả ghi nhận |
| --- | --- |
| Nổi mẩn đỏ, lượt 1 | HTTP 200, `followUpRequired=true`, `specialty=null`, `doctors=[]`. Chưa gọi catalog. |
| Trả lời “Khoảng hai ngày nay” | HTTP 200, `followUpRequired=false`, `specialty="Da liễu"`, `demoMode=false`, trả đúng ID fixture `10000000-0000-4000-8000-000000000001`. |
| Yêu cầu khám nội tổng quát, hai lượt | HTTP 200, `specialty="Nội tổng quát"`, trả đúng ID fixture `10000000-0000-4000-8000-000000000003`. |
| Da liễu ở Bình Thạnh hoặc fixture Da liễu inactive trong mock | HTTP 200, giữ `specialty="Da liễu"`, `doctors=[]`, `demoMode=false`. |
| PostgREST mock trả HTTP 500 | API trả HTTP 503 và `{"error":"Doctor catalog unavailable"}`. |

**Cách chạy lại trên Supabase test**

1. Chạy backend từ `feat/issue-47` với cấu hình Supabase test. Lượt 1 gửi `{"messages":["Tôi bị nổi mẩn đỏ"]}` và kiểm tra HTTP 200, `followUpRequired=true`, `specialty=null`.
2. Lượt 2 gửi `{"messages":["Tôi bị nổi mẩn đỏ","Khoảng hai ngày nay"]}` và kiểm tra HTTP 200, `followUpRequired=false`, `specialty="Da liễu"`, `demoMode=false`. Đối chiếu ID fixture và nhãn chuyên khoa trong `doctors` với truy vấn chỉ đọc trên cùng project.

```sql
select id, specialty, active
from public.doctors
where id = '10000000-0000-4000-8000-000000000001';
```

Ghi lại revision của backend, môi trường test, status/body của hai lượt và kết quả truy vấn đã lược bỏ thông tin không cần thiết để Lead review.

### Bàn giao US-01 cho Lead, FE1 và QA

- **[Lead #51](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/51)** review thay đổi cục bộ của [BE2 #47](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/47), gồm contract của `POST /api/consult`, thứ tự emergency → follow-up → gợi ý chuyên khoa và giới hạn AI ở trích xuất bộ lọc. Ghi tên reviewer và link xác nhận trên PR của BE2 khi có.
- **[FE1 #48](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/48)** gửi lại các tin bệnh nhân đã gửi thành công theo thứ tự. Dùng `followUpRequired` để mở lượt tiếp theo. Ưu tiên `urgent=true` để hiện một cảnh báo và ẩn CTA thường. Gắn nhãn theo `mode` và `usedAI`, dùng `address` và `district` từ kiểu `Doctor`. Phân biệt `demoMode=true` (catalog chưa cấu hình) với `demoMode=false` và `doctors=[]` (empty state nếu đã có chuyên khoa).
- **[FE2 #49](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/49)** nhận `specialty` từ kết quả tư vấn hợp lệ để lọc Doctor Discovery và dùng `doctors[].id` từ catalog để mở hồ sơ. Chặn chuyển luồng thường nếu `urgent=true`.
- **[QA #50](https://github.com/longzu-ComputerScience/7Scrum--Doctor-Appointment-Booking/issues/50)** dùng mẫu HTTP để đối chiếu FR-01 (hai lượt, input sai), FR-02 (chuyên khoa), FR-03 (active, empty state, demo) và FR-04 (khẩn cấp ở tin đầu hoặc tin sau, AI lỗi). Tách kết quả mock ở trên khỏi kiểm tra UI và ca hai lượt trên Supabase test.

**Trạng thái BE2 ngày 05/11/2026.** Ca API hai lượt trên Supabase test và truy vấn đối chiếu fixture đều pass. Ruff pass. Pytest có 19 ca pass và 1 ca fail tại `test_chatbot_followup_and_dermatology` vì test kỳ vọng bác sĩ demo trong môi trường thiếu DB, trong khi contract trả `demoMode=true` và `doctors=[]`. Còn chờ review của Lead và xác nhận bàn giao từ các đầu mối.

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

1. Đăng ký Doctor, xác nhận email, đăng nhập, kiểm tra `GET /api/doctor/schedule` và lấy slot 30 phút từ availability. Đăng ký Patient và đối chiếu `GET /api/patient/me`.
2. Dùng hai Patient JWT gửi đồng thời cùng một `slotId`. Xác minh đúng một HTTP 201, một HTTP 409, một booking `confirmed` và một notification trong DB. Kiểm tra JWT thiếu/sai và JWT Doctor gọi booking.
3. Kiểm tra notification và upcoming của đúng Doctor. Dùng Doctor khác gọi PATCH để kiểm tra quyền. Gửi lại PATCH đọc cùng notification và đối chiếu `readAt`.
4. Đổi lịch khiến slot đã đặt nằm ngoài giờ làm. Xác minh 409 và GET vẫn trả phiên bản trước. Hủy lịch hẹn, kiểm tra slot xuất hiện lại nếu còn đủ điều kiện và kiểm tra cập nhật calendar/dashboard khi reconnect.

## Handoff đúng chỗ

- **BE1 #31:** `supabase/migrations/`, schema target, doctor_working_hours/materialization, patient/doctor Auth mapping & invitations, status constraints, booking+notification transactional safety.
- **BE2 #32:** `backend/app/main.py`, `service.py`, `schemas.py`; triển khai các target HTTP routes/bodies/responses/error như bảng trên. **Chốt contract = cập nhật đúng bảng và mẫu JSON ở file này trong PR, rồi Lead #36 review**.
- **FE1 #33:** Patient/Doctor Auth, Doctor List, Doctor Dashboard/appointments/notifications; **FE2 #34**: shared weekly editor + patient booking calendar/modal. **Tester #35**: contract + E2E theo [ACCEPTANCE_SCENARIO](ACCEPTANCE_SCENARIO.md).
