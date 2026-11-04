# Contract API v2 — FE và BE cùng triển khai

Phiên bản thiết kế: **v2**, ngày **04/11/2026**. Nguồn quy ước bảng, khóa và validation: [DATA_DICTIONARY.md](DATA_DICTIONARY.md).

**Đây là contract đích, chưa được code hiện tại thực thi.** API hiện hành được mô tả ở [API_CONTRACT.md](API_CONTRACT.md). V2 bỏ dữ liệu clinic/room, bổ sung chứng chỉ/rating trên doctor và phân quyền staff theo doctor. Cần triển khai FE, BE và migration cùng đợt trước khi sử dụng contract này. `v2` là phiên bản tài liệu, không phải tiền tố URL: vẫn dùng `/api/*`, chưa có `/api/v2/*`.

## 1. Quy tắc truyền dữ liệu

- FE gọi cùng origin `/api/*`; Next.js proxy đến FastAPI qua `BACKEND_URL`. Không gọi Supabase trực tiếp để đọc/ghi dữ liệu nghiệp vụ.
- Request có body dùng `Content-Type: application/json`. Response thành công và lỗi do ứng dụng xử lý dùng JSON.
- JSON dùng `camelCase`; BE ánh xạ về cột DB `snake_case`. Không gửi `clinicId`, `clinicName`, `clinicAddress`, `roomId`, `roomName` hoặc đồng thời cả tên cũ/tên mới.
- UUID là JSON string; thời điểm là ISO 8601 có múi giờ. BE chuẩn hóa response về UTC dạng `2026-11-05T02:00:00Z`; FE hiển thị `Asia/Ho_Chi_Minh`.
- Key response trong từng schema dưới đây luôn có mặt; nullable trả `null`; mảng rỗng trả `[]`. Không trả chuỗi `"null"`, chuỗi `"undefined"`, số thay boolean hoặc chuỗi thay number.
- Request body chỉ nhận key đã liệt kê; cấu hình model BE đích tương đương `extra="forbid"`, key ngoài contract trả 422. Không tự bỏ qua `status`, `doctorId` hoặc field cũ trong booking body.
- Kiểm tra đúng kiểu JSON trước khi normalize; không ép `true` thành `1`, `"5"` thành `5`, số điện thoại number thành string. UUID được parse từ chuỗi, không cấu hình strict toàn model theo cách chặn UUID JSON hợp lệ.
- Chuỗi được chuẩn hóa Unicode NFC, trim đầu/cuối, rồi kiểm tra độ dài theo số Unicode code point; không xóa khoảng trắng bên trong tên hoặc nội dung. FE cần đếm code point (ví dụ `Array.from(value).length` sau normalize), không mặc định đồng nhất `string.length` của JavaScript với độ dài phía Python. Dùng cùng quy tắc ở [data dictionary](DATA_DICTIONARY.md).
- Query parameter vốn là chuỗi trên URL. FE tạo query bằng `URLSearchParams`; bỏ param không dùng. Chuỗi rỗng/sau trim rỗng tương đương không lọc. Chuỗi `"null"` không phải null.
- Không có phân trang ở MVP: mỗi danh sách tối đa **100** bản ghi. Không trả `total`, `page`, `hasMore`; FE không được coi 100 bản ghi là toàn bộ dữ liệu. Áp toàn bộ điều kiện tìm kiếm, khả dụng và phân quyền **trước LIMIT**.

## 2. Schema đối tượng công khai

### 2.1. `Certificate`

| Field | Kiểu JSON / FE | Có key | Nullable | Quy ước / ý nghĩa |
|---|---|---|---|---|
| `name` | `string` | Có | Không | Tên chứng chỉ/văn bằng; trim; 1–200 ký tự |
| `issuer` | `string` | Có | Không | Tổ chức cấp; trim; 1–200 ký tự |
| `issuedYear` | `number` nguyên | Có | Có | 1900 đến năm hiện tại theo `Asia/Ho_Chi_Minh`; không rõ thì null |
| `credentialUrl` | `string` | Có | Có | URL HTTPS công khai, không chứa username/password; tối đa 2.048 ký tự; chưa có thì null |

Một doctor có 0–20 chứng chỉ. `certificates` luôn là mảng object, không dùng chuỗi, object đơn hoặc `null`. Cấu trúc JSONB lưu trong DB giữ nguyên các key camelCase bên trong Certificate. URL không có nghĩa BE đã xác thực chứng chỉ; không hiển thị nhãn xác minh khi chưa có quy trình xác minh.

### 2.2. `Doctor`

| Field | Kiểu JSON / FE | Nullable | Nguồn / ý nghĩa |
|---|---|---|---|
| `id` | `string` UUID | Không | `doctors.id` |
| `name` | `string` | Không | `doctors.name`, họ tên bác sĩ |
| `specialty` | `string` | Không | `doctors.specialty`, chuyên khoa |
| `bio` | `string` | Không | `doctors.bio`; chưa có thì `""` |
| `address` | `string` | Không | `doctors.address`, địa chỉ khám hiện tại |
| `district` | `string` | Không | `doctors.district`, khu vực lọc |
| `certificates` | `Certificate[]` | Không | `doctors.certificates` |
| `rating` | `number` | Có | `doctors.rating`, số hữu hạn 1–5, tối đa 2 chữ số thập phân; chưa có đánh giá thì null |
| `ratingCount` | `number` nguyên | Không | `doctors.rating_count`, số đánh giá 0–2.147.483.647 |

Tất cả key trên bắt buộc có mặt. `rating === null` đi cùng `ratingCount === 0`; có rating phải có count >0. BE cần serializer tường minh để xuất Decimal thành JSON number, vì không được mặc định mọi thư viện đều xuất kiểu đó. Không serialize thành chuỗi `"4.50"`; JSON `4.5` và `4.50` là cùng giá trị, FE tự định dạng khi hiển thị. Không có endpoint để người dùng tự sửa rating/chứng chỉ trong MVP.

### 2.3. `AppointmentSlot`

| Field | Kiểu JSON / FE | Nullable | Ý nghĩa |
|---|---|---|---|
| `id` | `string` UUID | Không | `appointment_slots.id` |
| `doctorId` | `string` UUID | Không | `appointment_slots.doctor_id` |
| `startAt` | `string` ISO 8601 UTC | Không | Thời điểm bắt đầu |
| `endAt` | `string` ISO 8601 UTC | Không | Thời điểm kết thúc, lớn hơn startAt |

Tất cả key bắt buộc. Slot là khung giờ, chưa phải lịch hẹn và không phải giữ chỗ. Danh sách chỉ chứa khung giờ của bác sĩ active, đã công bố, ở tương lai và không có appointment với status khác `cancelled`.

### 2.4. `StaffAppointment`

| Field | Kiểu JSON / FE | Nullable | Nguồn / ý nghĩa |
|---|---|---|---|
| `id` | `string` UUID | Không | `appointments.id`, ID dùng trên URL PATCH |
| `slotId` | `string` UUID | Không | `appointments.slot_id` |
| `doctorId` | `string` UUID | Không | `appointment_slots.doctor_id` qua slot |
| `doctorName` | `string` | Không | `doctors.name` qua slot |
| `patientName` | `string` | Không | `appointments.patient_name` |
| `patientPhone` | `string` | Không | `appointments.patient_phone`, giữ số 0 đầu |
| `startAt` | `string` ISO 8601 UTC | Không | `appointment_slots.start_at` |
| `status` | `AppointmentStatus` | Không | Một trong 5 giá trị ở mục 4 |

Tất cả key bắt buộc. Không trả `notes`, `bookingReference`, `createdAt`, `updatedAt`, `address` hay dữ liệu membership ở endpoint staff hiện có. Chỉ đọc dữ liệu của doctor được gán quyền, kể cả lịch sử của doctor hiện đã inactive.

### 2.5. `DoctorSearchFilters` — filter assistant đã chuẩn hóa

| Field | Kiểu | Có key | Quy định |
|---|---|---|---|
| `specialty` | `string hoặc null` | Có | Chuỗi không rỗng, tối đa 80 ký tự; null nếu không dùng |
| `district` | `string hoặc null` | Có | Chuỗi không rỗng, tối đa 80 ký tự; null nếu không dùng |
| `keyword` | `string hoặc null` | Có | Chuỗi không rỗng, tối đa 100 ký tự; null nếu không dùng |

V2 chuẩn hóa cả AI lẫn fallback theo cùng giới hạn. Nếu filter do bộ trích xuất sinh quá dài thì trim rồi cắt theo giới hạn; filter sau chuẩn hóa rỗng thành null. Đây là xử lý đầu ra nội bộ, khác với query người dùng quá dài phải trả 422. Nhánh urgent trả cả ba key với giá trị null. **Khác v1:** v1 có thể trả `filters: {}` ở nhánh urgent; FE v2 không cần đọc key optional.

## 3. Endpoint: request, response và hành vi

### 3.1. `GET /api/health`

Không cần token, không có body hay query. HTTP 200:

```json
{
  "status": "ok",
  "databaseConfigured": false
}
```

`status` là literal `"ok"`, không phải AppointmentStatus. `databaseConfigured` là boolean cho biết có cấu hình DB, không phải phép thử kết nối hoặc chứng minh hệ thống sẵn sàng booking.

### 3.2. `GET /api/doctors`

Không cần token, không có body. Query:

| Param | Kiểu trên URL | Bắt buộc | Giới hạn sau trim | Ý nghĩa |
|---|---|---|---|---|
| `specialty` | Chuỗi | Không | 0–80 ký tự | Chuyên khoa |
| `district` | Chuỗi | Không | 0–80 ký tự | Khu vực |
| `keyword` | Chuỗi | Không | 0–100 ký tự | Tìm trong tên bác sĩ, chuyên khoa, địa chỉ, khu vực |

Các filter khác rỗng được nối bằng AND; keyword khớp bất kỳ field nêu trên. So khớp không phân biệt hoa/thường/dấu tiếng Việt; alias chuyên khoa đã công bố trong BE được chuẩn hóa trước khi lọc. V2 không thêm filter `rating`, `sort`, `page` hoặc `limit` trong contract. Chỉ lấy doctor active; sắp xếp `id ASC` ổn định; tối đa 100 doctor sau khi lọc đầy đủ.

HTTP 200 có `doctors: Doctor[]` và `demoMode: boolean`. Ví dụ dùng dữ liệu giả đã seed vào DB kiểm thử để minh họa cả luồng đặt lịch bên dưới.

```json
{
  "doctors": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "name": "Bác sĩ Nguyễn Demo",
      "specialty": "Da liễu",
      "bio": "Hồ sơ minh họa phục vụ kiểm thử.",
      "address": "123 Đường Demo",
      "district": "Thủ Đức",
      "certificates": [
        {
          "name": "Chứng chỉ minh họa",
          "issuer": "Đơn vị Demo",
          "issuedYear": 2025,
          "credentialUrl": null
        }
      ],
      "rating": null,
      "ratingCount": 0
    }
  ],
  "demoMode": false
}
```

Không khớp trả `doctors: []`, không phải 404. Query sai giới hạn trả 422; lỗi catalog thật trả 503, không tự tráo dữ liệu giả thay cho DB gặp sự cố.

### 3.3. `GET /api/doctors/{doctorId}`

Không cần token. Path `doctorId` là UUID. Truy vấn trực tiếp theo ID, **không tìm trong danh sách đã LIMIT 100**.

HTTP 200 gồm `doctor: Doctor` và `demoMode: boolean`. Doctor không tồn tại hoặc inactive trả 404; path UUID sai trả 422. Không trả profile clinic/room.

### 3.4. `GET /api/doctors/{doctorId}/slots`

Không cần token. Path `doctorId` là UUID; không body/query. Doctor không tồn tại hoặc inactive trả 404, UUID sai trả 422. Doctor hợp lệ nhưng hết slot trả `slots: []`.

Sắp xếp `start_at ASC, id ASC`; lọc toàn bộ điều kiện khả dụng trước khi LIMIT 100. HTTP 200:

```json
{
  "slots": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "doctorId": "11111111-1111-4111-8111-111111111111",
      "startAt": "2026-11-05T02:00:00Z",
      "endAt": "2026-11-05T02:30:00Z"
    }
  ],
  "demoMode": false
}
```

Thời gian trong ví dụ phục vụ minh họa; fixture chạy test phải tạo slot tương lai theo đồng hồ test. Không cache kết quả như bằng chứng giữ chỗ; backend vẫn kiểm tra lại khi POST booking.

### 3.5. `POST /api/assistant`

Không cần token. Body chỉ có:

| Field | Kiểu | Bắt buộc | Validation |
|---|---|---|---|
| `message` | `string` | Có | Trim, 2–800 ký tự; không nhận null hoặc chuỗi chỉ có khoảng trắng |

HTTP 200 có đủ 6 key.

| Field | Kiểu | Ý nghĩa |
|---|---|---|
| `doctors` | `Doctor[]` | Kết quả catalog thật hoặc fixture demo; tối đa 100, cùng thứ tự tìm kiếm |
| `filters` | `DoctorSearchFilters` | Filter chuẩn hóa với đủ 3 key |
| `usedAI` | `boolean` | Có sử dụng kết quả trích xuất AI hợp lệ |
| `demoMode` | `boolean` | Có dùng catalog minh họa |
| `urgent` | `boolean` | Nhánh xử lý tình huống khẩn cấp |
| `message` | `string` | Thông báo do BE cung cấp để FE hiển thị |

Ví dụ response không khớp catalog:

```json
{
  "doctors": [],
  "filters": {
    "specialty": "Da liễu",
    "district": "Thủ Đức",
    "keyword": null
  },
  "usedAI": false,
  "demoMode": false,
  "urgent": false,
  "message": "Không có bác sĩ phù hợp. Hãy thử chuyên khoa hoặc khu vực khác."
}
```

AI thiếu cấu hình, timeout hoặc output sai thì dùng fallback, `usedAI: false`. Fallback không tạo doctor giả ngoài catalog. Nếu bước lấy catalog thật lỗi thì 503; không trả thành công với danh sách rỗng để che lỗi DB. Nhánh urgent không truy vấn catalog, trả `doctors: []`, ba filters null, `usedAI: false`, `demoMode: false`, `urgent: true` và thông báo khẩn cấp; FE hiển thị thông báo và không chuyển thẳng sang gợi ý đặt lịch. Không suy ra kết nối DB từ `demoMode` của nhánh urgent.

Assistant chỉ tìm kiếm/lọc, không tự chẩn đoán, xác nhận còn slot hoặc tạo appointment. Không phụ thuộc nội dung câu `message` để điều khiển logic FE; dùng các key boolean.

### 3.6. `POST /api/appointments`

Không cần token bệnh nhân. Body chỉ gồm:

| Field | Kiểu | Bắt buộc | Nullable | Validation / default |
|---|---|---|---|---|
| `slotId` | `string` UUID | Có | Không | Slot lấy từ endpoint slots |
| `patientName` | `string` | Có | Không | Trim, 2–100 ký tự |
| `patientPhone` | `string` | Có | Không | Normalize/trim, regex `^\+?[0-9 ()-]{9,20}$` và có ít nhất 9 chữ số ASCII `[0-9]` |
| `notes` | `string` | Không | Không | Trim, tối đa 500 ký tự; bỏ key → `""` |

Regex điện thoại giới hạn phần sau dấu `+` tùy chọn thành 9–20 ký tự thuộc tập cho phép. V2 bổ sung điều kiện ít nhất 9 chữ số ASCII để loại chuỗi chỉ chứa dấu phân cách; đây là thay đổi validation so với v1. Không chứng minh số điện thoại có thật hoặc đã nhận OTP. Không tự đổi điện thoại sang dạng số hay loại dấu bên trong khi gửi. FE có thể kiểm tra trước nhưng BE và RPC phải là nơi quyết định.

Request minh họa:

```json
{
  "slotId": "22222222-2222-4222-8222-222222222222",
  "patientName": "Nguyễn Văn Demo",
  "patientPhone": "0900000000",
  "notes": ""
}
```

Trong cùng giao dịch, DB khóa doctor và slot, kiểm tra doctor active, slot đã công bố và `start_at > clock_timestamp()` tại lúc kiểm tra sau khi lấy khóa. Unique index cho phép tối đa một appointment chưa hủy trên mỗi slot. Tạo thành công trả HTTP **201**.

```json
{
  "appointmentId": "33333333-3333-4333-8333-333333333333",
  "bookingReference": "A1B2C3D4E5F6",
  "status": "requested"
}
```

Cả 3 key bắt buộc. `appointmentId` là UUID; `bookingReference` là mã 12 ký tự hex in hoa do DB tạo; `status` luôn là literal `requested`. Đây là đã gửi yêu cầu, chưa phải đã được nhân viên xác nhận.

Slot UUID hợp lệ nhưng không tồn tại/đã qua/không công bố/doctor inactive/đã có lịch chưa hủy đều trả 409. Body sai trả 422. Chưa cấu hình DB hoặc lỗi hạ tầng trả 503; không tạo booking demo.

**Retry:** MVP chưa có idempotency key. Timeout hoặc mất mạng sau POST có thể xảy ra sau khi DB đã tạo lịch; FE không được kết luận chắc chắn thất bại hoặc tự lặp vô hạn. Ngăn double-click; sau trạng thái không rõ, tải lại slot và hướng người dùng liên hệ nhân viên kiểm tra trước khi đặt lại. Không có endpoint công khai tra lịch hẹn bằng số điện thoại hay mã tham chiếu trong contract này.

### 3.7. `GET /api/staff/appointments`

Bắt buộc Bearer token; không có body/query. BE lấy user từ token, tra `staff_members` theo `user_id` để lấy danh sách `doctor_id`, sau đó lọc appointment qua slot. Không tin doctor ID do browser gửi để cấp quyền.

Đọc mọi status trong phạm vi quyền, gồm lịch sử doctor inactive. Sắp xếp `appointments.created_at DESC, appointments.id DESC`; tối đa 100 sau phân quyền. Không có lịch hẹn trả `appointments: []`. User hợp lệ nhưng chưa có membership trả 403.

HTTP 200:

```json
{
  "appointments": [
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "slotId": "22222222-2222-4222-8222-222222222222",
      "doctorId": "11111111-1111-4111-8111-111111111111",
      "doctorName": "Bác sĩ Nguyễn Demo",
      "patientName": "Nguyễn Văn Demo",
      "patientPhone": "0900000000",
      "startAt": "2026-11-05T02:00:00Z",
      "status": "requested"
    }
  ]
}
```

Không có `demoMode`: endpoint này cần DB thật và session hợp lệ, không trả lịch hẹn demo khi cấu hình thiếu. FE không lưu lâu dài hoặc log toàn bộ danh sách có thông tin người đặt.

### 3.8. `PATCH /api/appointments/{appointmentId}`

Bắt buộc Bearer token; `appointmentId` là UUID trên URL. Body chỉ có `status`, kiểu string bắt buộc, không nhận null, giá trị đích chỉ gồm `confirmed`, `checked_in`, `completed`, `cancelled`.

Request minh họa:

```json
{
  "status": "confirmed"
}
```

BE xác thực user và quyền doctor của appointment, kiểm tra bước chuyển và UPDATE có điều kiện status cũ trong cùng thao tác có bảo vệ tranh chấp. Appointment không tồn tại trả 404; thuộc doctor không được gán trả 403. Path sai UUID hoặc status ngoài schema, kể cả `requested`, trả 422. Bước chuyển không hợp lệ hoặc dữ liệu đã thay đổi đồng thời trả 409.

HTTP 200:

```json
{
  "appointment": {
    "id": "33333333-3333-4333-8333-333333333333",
    "status": "confirmed"
  }
}
```

Wrapper `appointment` và cả `id`, `status` bắt buộc. Không trả lại cả bệnh án hoặc thông tin bệnh nhân chỉ để xác nhận cập nhật.

## 4. Bộ status và bước chuyển cố định

| Hiện tại | Đích hợp lệ | Nhãn UI gợi ý |
|---|---|---|
| `requested` | `confirmed`, `cancelled` | Chờ xác nhận |
| `confirmed` | `checked_in`, `cancelled` | Đã xác nhận |
| `checked_in` | `completed`, `cancelled` | Đã đến khám |
| `completed` | Không có | Hoàn tất |
| `cancelled` | Không có | Đã hủy |

Với status đích hợp lệ, bước chuyển ngoài bảng hoặc gửi lại status hiện tại trả 409. Status đích ngoài schema, kể cả `requested`, trả 422. Nhân viên có thể hủy sau check-in. Sau khi hủy, slot chỉ đặt lại được khi còn ở tương lai, đã công bố và doctor active. Nhân viên vẫn xử lý lịch cũ theo quyền khi doctor inactive hoặc slot bị ẩn. Ma trận áp dụng cả trước và sau giờ khám. Các trạng thái chỉ thay đổi qua thao tác hợp lệ của nhân viên sau khi lịch được tạo.

## 5. Xác thực và lỗi

Staff dùng `Authorization: Bearer <access_token>` lấy từ Supabase Auth SDK. `access_token` là tên field SDK, không đổi tên nó khi đọc session. Token không gửi trong query/body. Public endpoint không dùng token để mở thêm quyền. Service-role và AI key chỉ ở BE.

| HTTP | Dạng body của ứng dụng | Điều kiện chính | Xử lý FE |
|---|---|---|---|
| 401 | `{error: string}` | Thiếu token, token không hợp lệ/hết hạn | Đăng nhập/refresh session theo SDK |
| 403 | `{error: string}` | User hợp lệ nhưng thiếu membership hoặc sai doctor | Hiển thị không có quyền |
| 404 | `{error: string}` | Doctor public không tồn tại/inactive; appointment PATCH không tồn tại | Hiển thị không tìm thấy |
| 409 | `{error: string}` | Slot không còn đặt được; bước status sai; xung đột đồng thời | Bỏ slot đang chọn/tải lại dữ liệu liên quan |
| 422 | `{detail: ValidationIssue[]}` | Body/query/path sai kiểu, giới hạn hoặc key ngoài schema | Gắn lỗi đúng field khi có vị trí phù hợp |
| 503 | `{error: string}` | DB chưa cấu hình, kết nối/SDK/RPC/cơ sở xác thực không sẵn sàng | Báo dịch vụ tạm không sẵn sàng; không báo booking thành công |

Lỗi hạ tầng xác thực khác với token được xác định là không hợp lệ; không gom mọi exception thành 401. FE phân nhánh theo HTTP status và cấu trúc body, không so khớp nguyên văn câu `error`. Chuỗi lỗi không phải mã lỗi ổn định và không được chứa SQL, secret, token hoặc toàn bộ payload bệnh nhân.

422 giữ cấu trúc FastAPI/Pydantic với `detail` là mảng. Mỗi phần tử có `loc` (mảng string/number), `msg` và `type`; các key khác tùy phiên bản/loại lỗi, FE phải bỏ qua phần không dùng. Không giả định lúc nào cũng có `ctx`, `input` hay `url`.

```json
{
  "detail": [
    {
      "loc": ["body", "patientName"],
      "msg": "Tên người đặt phải có ít nhất 2 ký tự sau khi bỏ khoảng trắng đầu cuối",
      "type": "value_error"
    }
  ]
}
```

Đây là ví dụ hình dạng, không chốt nguyên văn thông báo Pydantic. Với lỗi proxy/mạng hoặc 500 ngoài handler ứng dụng, body có thể không phải JSON; FE cần thông báo lỗi chung nếu không parse được. Không log raw validation `input` có thông tin người đặt.

## 6. Demo, fallback và giới hạn MVP

| Tình huống | Hành vi đích |
|---|---|
| Chưa cấu hình Supabase | Catalog/detail/slots có thể dùng fixture giả, `demoMode: true`; booking/staff trả 503, không có thành công giả |
| Supabase đã cấu hình nhưng truy cập lỗi | 503 ở chức năng phụ thuộc DB; không fallback sang fixture âm thầm |
| AI thiếu cấu hình hoặc lỗi | Search fallback, `usedAI: false`; dữ liệu doctor vẫn từ catalog |
| Assistant urgent | Không query catalog; doctors rỗng, filters đủ 3 key null; hiển thị thông báo BE |
| Không có kết quả | HTTP 200 với mảng rỗng; không bịa doctor hoặc slot |

Ngày giờ preview không đảm bảo slot còn trống khi đặt. Tối đa 100 kết quả và chưa có phân trang nghĩa là dashboard chỉ hiển thị 100 lịch gần nhất, chưa phù hợp để khai thác toàn bộ lịch sử. Không bổ sung API review, CRUD doctor/slot, tự hủy của bệnh nhân hoặc quản lý membership ngoài phạm vi 8 endpoint này.

## 7. Type TypeScript thống nhất

Đoạn dưới là contract đích để chuyển vào file type dùng chung khi triển khai; chưa tự thay thế source hiện tại. TypeScript không kiểm tra response runtime, BE vẫn phải validate output và FE xử lý lỗi dữ liệu.

```ts
export type UUID = string;
export type ISODateTime = string;

export type Certificate = {
  name: string;
  issuer: string;
  issuedYear: number | null;
  credentialUrl: string | null;
};

export type Doctor = {
  id: UUID;
  name: string;
  specialty: string;
  bio: string;
  address: string;
  district: string;
  certificates: Certificate[];
  rating: number | null;
  ratingCount: number;
};

export type AppointmentSlot = {
  id: UUID;
  doctorId: UUID;
  startAt: ISODateTime;
  endAt: ISODateTime;
};

export type AppointmentStatus =
  | "requested"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled";
export type AppointmentStatusTarget = Exclude<AppointmentStatus, "requested">;

export type StaffAppointment = {
  id: UUID;
  slotId: UUID;
  doctorId: UUID;
  doctorName: string;
  patientName: string;
  patientPhone: string;
  startAt: ISODateTime;
  status: AppointmentStatus;
};

export type DoctorSearchQuery = {
  specialty?: string;
  district?: string;
  keyword?: string;
};
export type DoctorSearchFilters = {
  specialty: string | null;
  district: string | null;
  keyword: string | null;
};

export type AssistantInput = { message: string };
export type BookingInput = {
  slotId: UUID;
  patientName: string;
  patientPhone: string;
  notes?: string;
};
export type StatusInput = { status: AppointmentStatusTarget };

export type HealthResponse = { status: "ok"; databaseConfigured: boolean };
export type DoctorListResponse = { doctors: Doctor[]; demoMode: boolean };
export type DoctorDetailResponse = { doctor: Doctor; demoMode: boolean };
export type SlotListResponse = { slots: AppointmentSlot[]; demoMode: boolean };
export type AssistantResponse = {
  doctors: Doctor[];
  filters: DoctorSearchFilters;
  usedAI: boolean;
  demoMode: boolean;
  urgent: boolean;
  message: string;
};
export type BookingResponse = {
  appointmentId: UUID;
  bookingReference: string;
  status: "requested";
};
export type StaffAppointmentListResponse = { appointments: StaffAppointment[] };
export type StatusResponse = {
  appointment: { id: UUID; status: AppointmentStatusTarget };
};
export type ApiErrorResponse = { error: string };
export type ValidationIssue = {
  loc: (string | number)[];
  msg: string;
  type: string;
  [key: string]: unknown;
};
export type ValidationErrorResponse = { detail: ValidationIssue[] };
```

## 8. Điều kiện nghiệm thu khi thực thi v2

- Request/response được kiểm tra theo schema; không còn field clinic/room; các key nullable có mặt, rating là number hoặc null.
- Search áp filter trước giới hạn; detail không bị mất doctor do đã LIMIT; slots loại lịch chưa hủy trước LIMIT; thứ tự ổn định.
- Body dư key, sai UUID, chuỗi rỗng sau trim, số điện thoại number, notes null và status ngoài enum đều bị từ chối đúng contract.
- Assistant AI/fallback/urgent trả cùng cấu trúc filters; không có doctor tự bịa hoặc appointment tự tạo.
- Hai request booking cùng slot chỉ có một HTTP 201; trường hợp timeout không bị FE hiểu thành chắc chắn chưa đặt.
- Staff được cấp doctor A không đọc/sửa được lịch doctor B; token sai trả 401, hạ tầng lỗi trả 503; doctor inactive vẫn xử lý được lịch cũ.
- Kiểm tra toàn bộ bước chuyển hợp lệ và không hợp lệ, gồm update đồng thời; không chuyển trạng thái kết thúc về trạng thái đang xử lý.
- Demo booking luôn bị chặn; các response lỗi mạng/proxy không JSON vẫn có thông báo FE phù hợp.
