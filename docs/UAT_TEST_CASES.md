# Tài liệu Đặc tả Kiểm thử Chấp nhận Người dùng (UAT Test Cases) & Hướng dẫn Vận hành Hệ thống

**Dự án:** 7Scrum — Doctor Appointment Booking  
**Phiên bản Đặc tả:** Theo bảng Functional Requirements (`FR-01` → `FR-11`), Non-Functional Requirements (`NFR-01` → `NFR-07`) & Contract API v2 ([`docs/API_CONTRACT_V2.md`](API_CONTRACT_V2.md), [`docs/DATA_DICTIONARY.md`](DATA_DICTIONARY.md))  
**Ngày cập nhật:** 04/11/2026

---

## Mục lục

1. [Tổng quan Phạm vi Kiểm thử & Ma trận Truy vết (Traceability Matrix)](#1-tổng-quan-phạm-vi-kiểm-thử--ma-trận-truy-vết-traceability-matrix)
2. [Chuẩn bị Môi trường & Dữ liệu Mẫu (Test Data Setup — Schema v2)](#2-chuẩn-bị-môi-trường--dữ-liệu-mẫu-test-data-setup--schema-v2)
3. [Phần 1: US-01 — Patient Symptom Consultation & Specialty Recommendation (`FR-01` → `FR-04`)](#3-phần-1-us-01--patient-symptom-consultation--specialty-recommendation-fr-01--fr-04)
   - [3.1. FR-01: Symptom Input & Conversation](#31-fr-01-symptom-input--conversation)
   - [3.2. FR-02: Specialty Recommendation](#32-fr-02-specialty-recommendation)
   - [3.3. FR-03: Doctor Navigation](#33-fr-03-doctor-navigation)
   - [3.4. FR-04: Emergency Handling & Fallback](#34-fr-04-emergency-handling--fallback)
4. [Phần 2: US-02 — Doctor Discovery & Appointment Booking (`FR-05` → `FR-11`)](#4-phần-2-us-02--doctor-discovery--appointment-booking-fr-05--fr-11)
   - [4.1. FR-05: Doctor Listing & Specialty Filtering](#41-fr-05-doctor-listing--specialty-filtering)
   - [4.2. FR-06: Doctor Profile](#42-fr-06-doctor-profile)
   - [4.3. FR-07: Appointment Availability](#43-fr-07-appointment-availability)
   - [4.4. FR-08: Patient Information & Booking Submission](#44-fr-08-patient-information--booking-submission)
   - [4.5. FR-09: Booking Persistence & Double-booking Prevention](#45-fr-09-booking-persistence--double-booking-prevention)
   - [4.6. FR-10: Booking Result & Confirmation (`requested` = "Chờ xác nhận")](#46-fr-10-booking-result--confirmation-requested--chờ-xác-nhận)
   - [4.7. FR-11: Booking Error Handling](#47-fr-11-booking-error-handling)
5. [Phần 3: Kiểm thử Bộ Trạng thái Lịch hẹn & Phân quyền Nhân viên theo API v2](#5-phần-3-kiểm-thử-bộ-trạng-thái-lịch-hẹn--phân-quyền-nhân-viên-theo-api-v2)
6. [Phần 4: Kiểm thử Yêu cầu Phi chức năng & Quy tắc Nghiệp vụ Dùng chung (`NFR-01` → `NFR-07`)](#6-phần-4-kiểm-thử-yêu-cầu-phi-chức-năng--quy-tắc-nghiệp-vụ-dùng-chung-nfr-01--nfr-07)
7. [Phần 5: Kịch bản UAT End-to-End Liên thông (Từ Triệu chứng → Đặt lịch `requested` → Staff Xác nhận `confirmed`)](#7-phần-5-kịch-bản-uat-end-to-end-liên-thông-từ-triệu-chứng--đặt-lịch-requested--staff-xác-nhận-confirmed)
8. [Biên bản Ký Nghiệm thu UAT (UAT Sign-off Sheet)](#8-biên-bản-ký-nghiệm-thu-uat-uat-sign-off-sheet)

---

## 1. Tổng quan Phạm vi Kiểm thử & Ma trận Truy vết (Traceability Matrix)

| Nhóm / User Story | Mã Yêu cầu | Tên Yêu cầu (Requirement) | Các Tiêu chí Chấp nhận (AC) | Mã Test Case UAT Tương ứng |
| :--- | :---: | :--- | :---: | :--- |
| **US-01** *(P0 · Must Have)* | **FR-01** | Symptom Input & Conversation | AC01, AC02, AC03, AC04 | `UAT-FR01-01` → `UAT-FR01-05` |
| **US-01** *(P0 · Must Have)* | **FR-02** | Specialty Recommendation | AC01, AC02, AC03 | `UAT-FR02-01` → `UAT-FR02-04` |
| **US-01** *(P0 · Must Have)* | **FR-03** | Doctor Navigation | AC01, AC02, AC03 | `UAT-FR03-01` → `UAT-FR03-03` |
| **US-01** *(P0 · Must Have)* | **FR-04** | Emergency Handling & Fallback | AC01, AC02, AC03, AC04 | `UAT-FR04-01` → `UAT-FR04-05` |
| **US-02** *(P0 · Must Have)* | **FR-05** | Doctor Listing & Specialty Filtering | AC01, AC02, AC03, AC04 | `UAT-FR05-01` → `UAT-FR05-05` |
| **US-02** *(P0 · Must Have)* | **FR-06** | Doctor Profile | AC01, AC02, AC03, AC04, AC05 | `UAT-FR06-01` → `UAT-FR06-05` |
| **US-02** *(P0 · Must Have)* | **FR-07** | Appointment Availability | AC01, AC02, AC03, AC04, AC05 | `UAT-FR07-01` → `UAT-FR07-06` |
| **US-02** *(P0 · Must Have)* | **FR-08** | Patient Information & Booking Submission | AC01, AC02, AC03, AC04, AC05 | `UAT-FR08-01` → `UAT-FR08-07` |
| **US-02** *(P0 · Must Have)* | **FR-09** | Booking Persistence & Double-booking Prevention | AC01, AC02, AC03, AC04 | `UAT-FR09-01` → `UAT-FR09-04` |
| **US-02** *(P0 · Must Have)* | **FR-10** | Booking Result & Confirmation | AC01, AC02, AC03, AC04 | `UAT-FR10-01` → `UAT-FR10-04` |
| **US-02** *(P0 · Must Have)* | **FR-11** | Booking Error Handling | AC01, AC02, AC03, AC04 | `UAT-FR11-01` → `UAT-FR11-04` |
| **API v2 Status Matrix** | **STATE** | Quản lý & Chuyển Trạng thái Lịch hẹn | 5 trạng thái (`requested` → `completed`/`cancelled`) | `UAT-STATE-01` → `UAT-STATE-06` |
| **Shared NFRs** | **NFR-01 → 07** | Persistence, Consistency, Timezone, Auth, Errors, Integrity, Demo Transparency | NFR-01 .. NFR-07 | `UAT-NFR-01` → `UAT-NFR-07` |

---

## 2. Chuẩn bị Môi trường & Dữ liệu Mẫu (Test Data Setup — Schema v2)

### 2.1. Khởi tạo Database & Dữ liệu Mẫu (Supabase)
Chạy tuần tự trong **Supabase SQL Editor**:
1. [`supabase/migrations/001_init.sql`](../supabase/migrations/001_init.sql) — Tạo các bảng `doctors`, `appointment_slots`, `appointments`, `staff_members`, ràng buộc GiST chống giao nhau (`appointment_slots_no_overlap`), unique index một lịch hẹn hoạt động trên mỗi slot (`appointments_one_active_per_slot`), cùng 2 hàm RPC `create_appointment` và `update_appointment_status`.
2. [`supabase/seed.sql`](../supabase/seed.sql) — Nạp 3 bác sĩ giả lập với đầy đủ trường của Schema v2:

| ID Bác sĩ (`doctors.id`) | Họ tên (`name`) | Chuyên khoa (`specialty`) | Khu vực (`district`) | Chứng chỉ (`certificates`) | Đánh giá (`rating` / `rating_count`) | Mục đích kiểm thử chính |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `10000000-0000-4000-8000-000000000001` | `BS. Nguyễn Minh An (Demo)` | `Da liễu` | `Thủ Đức` | 1 chứng chỉ (`issuedYear: 2024`, `credentialUrl: null`) | `4.50` / `2` đánh giá | Kiểm thử đầy đủ chứng chỉ + có rating + luồng Da liễu |
| `10000000-0000-4000-8000-000000000002` | `BS. Trần Hoàng Mai (Demo)` | `Tim mạch` | `Bình Thạnh` | 1 chứng chỉ (`issuedYear: null`, `credentialUrl: null`) | `null` / `0` đánh giá | Kiểm thử có chứng chỉ (`issuedYear: null`) nhưng **chưa có đánh giá** (`FR-06 AC04`) |
| `10000000-0000-4000-8000-000000000003` | `BS. Lê Quốc Bình (Demo)` | `Nội tổng quát` | `Thủ Đức` | Mảng rỗng `[]` | `null` / `0` đánh giá | Kiểm thử bác sĩ **chưa có chứng chỉ** và **chưa có đánh giá** (`FR-06 AC03, AC04`) |

### 2.2. Cấp quyền Nhân viên theo Bác sĩ (`staff_members` — Schema v2)
Tạo 2 tài khoản trong **Supabase Authentication → Users**:
- **Staff 1 (`staff1@7scrum.local`):** Gán quyền quản lý Bác sĩ 1 (`BS. Nguyễn Minh An`):
  ```sql
  insert into public.staff_members (user_id, doctor_id)
  values ('<AUTH-UUID-STAFF-1>', '10000000-0000-4000-8000-000000000001')
  on conflict (user_id, doctor_id) do nothing;
  ```
- **Staff 2 (`staff2@7scrum.local`):** Không gán vào bảng `staff_members` (dùng để kiểm thử lỗi `403 Forbidden` khi không có quyền).

### 2.3. Khởi chạy Hệ thống
- **Backend:** `http://127.0.0.1:8000` (`./backend/.venv/bin/uvicorn index:app --app-dir backend --reload --port 8000`)
- **Frontend:** `http://localhost:3000` (`npm --prefix frontend run dev`)

---

## 3. Phần 1: US-01 — Patient Symptom Consultation & Specialty Recommendation (`FR-01` → `FR-04`)

> **User Story:** *"Là bệnh nhân, tôi muốn mô tả triệu chứng và trả lời câu hỏi bổ sung thông qua chatbot, để được gợi ý chuyên khoa phù hợp và tìm bác sĩ tương ứng."*

---

### 3.1. `FR-01`: Symptom Input & Conversation
> **Đặc tả:** Hệ thống cung cấp giao diện chatbot để bệnh nhân nhập mô tả triệu chứng. Chatbot hỗ trợ một số kịch bản triệu chứng đã được định nghĩa trước và có khả năng hỏi thêm thông tin để làm rõ tình trạng.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR01-01`** | **AC01, AC02** | Nhập và hiển thị mô tả triệu chứng hợp lệ trong khung hội thoại | 1. Mở giao diện Chatbot tư vấn.<br>2. Nhập mô tả triệu chứng vào ô input.<br>3. Bấm nút **Gửi** (hoặc nhấn Enter). | `"Tôi bị nổi mẩn đỏ và ngứa ở cánh tay"` | - Tin nhắn được gửi thành công (`POST /api/consult` trả `HTTP 200`).<br>- Nội dung vừa nhập của bệnh nhân được hiển thị ngay trong khung lịch sử hội thoại (`Bạn: Tôi bị nổi mẩn đỏ...`).<br>- Ô nhập liệu được xóa trắng để chờ câu trả lời tiếp theo. |
| **`UAT-FR01-02`** | **AC03** | Chatbot đưa ra ít nhất một câu hỏi bổ sung ở lượt đầu tiên | Quan sát phản hồi của Chatbot ngay sau bước `UAT-FR01-01`. | Mảng `messages` có 1 phần tử hợp lệ (không thuộc nhóm cấp cứu) | - Chatbot trả về câu hỏi bổ sung để làm rõ thời gian/mức độ: *"Triệu chứng này bắt đầu từ khi nào? Bạn có thể bổ sung thời gian hoặc mức độ khó chịu."*<br>- Trong payload JSON: `followUpRequired: true`, `specialty: null`, `doctors: []`. |
| **`UAT-FR01-03`** | **AC04** | Trả lời câu hỏi bổ sung và xem lại toàn bộ lịch sử hội thoại | 1. Nhập câu trả lời cho câu hỏi bổ sung.<br>2. Bấm **Gửi**.<br>3. Quan sát toàn bộ khung hội thoại từ đầu. | `"Khoảng 2 ngày nay, ngứa nhiều vào buổi tối"` | - Cả 4 bong bóng tin nhắn (Lượt 1 Bệnh nhân → Câu hỏi phụ của Trợ lý → Lượt 2 Bệnh nhân → Kết luận của Trợ lý) đều hiển thị đầy đủ theo đúng thứ tự thời gian.<br>- Bệnh nhân có thể cuộn xem lại toàn bộ cuộc trò chuyện hoặc bấm **Bắt đầu lại** để xóa hội thoại. |
| **`UAT-FR01-04`** | **AC01, AC02** | Chặn gửi tin nhắn rỗng hoặc quá ngắn (< 2 ký tự sau khi trim) | 1. Nhập khoảng trắng `"   "` hoặc 1 ký tự `"a"` vào ô chat.<br>2. Quan sát nút **Gửi** và thử gọi API trực tiếp. | `"   "` hoặc `"a"` | - Trên UI: Nút **Gửi** bị khóa (`disabled`).<br>- Trên API: Trả về `HTTP 422 Unprocessable Entity` (*"Each message must be 2-800 characters"*). Không hiển thị tin nhắn lỗi vào lịch sử chat. |
| **`UAT-FR01-05`** | **AC01** | Giới hạn độ dài tin nhắn tối đa 800 ký tự và tối đa 4 lượt | 1. Thử nhập chuỗi > 800 ký tự vào ô input.<br>2. Gửi API `POST /api/consult` với 5 tin nhắn hoặc 1 tin nhắn dài 801 ký tự. | Chuỗi 801 ký tự hoặc mảng 5 phần tử | - Trên UI: Ô input giới hạn `maxLength={800}`.<br>- Trên API: Trả về `HTTP 422`. |

---

### 3.2. `FR-02`: Specialty Recommendation
> **Đặc tả:** Dựa trên thông tin bệnh nhân cung cấp, hệ thống xác định và đề xuất chuyên khoa phù hợp. Đây là chức năng điều hướng đến bác sĩ, không phải chẩn đoán.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào (2 lượt) | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR02-01`** | **AC01, AC02** | Đề xuất chính xác chuyên khoa **Da liễu** cho kịch bản triệu chứng ngoài da | Thực hiện 2 lượt chat mô tả triệu chứng da (nổi mẩn, mụn, da liễu). | 1. `"Tôi bị nổi mẩn đỏ trên mặt"`<br>2. `"Khoảng 3 ngày nay"` | - API trả về `specialty: "Da liễu"`, `followUpRequired: false`.<br>- Giao diện hiển thị nổi bật thẻ kết quả: **`Chuyên khoa gợi ý: Da liễu`**. |
| **`UAT-FR02-02`** | **AC01, AC02** | Đề xuất chính xác chuyên khoa **Tim mạch** cho kịch bản triệu chứng tim mạch | Thực hiện 2 lượt chat với triệu chứng liên quan đến tim mạch. | 1. `"Tôi muốn khám tim mạch vì hay hồi hộp"`<br>2. `"Kéo dài khoảng 1 tuần"` | - API trả về `specialty: "Tim mạch"`, `followUpRequired: false`.<br>- Giao diện hiển thị rõ: **`Chuyên khoa gợi ý: Tim mạch`**. |
| **`UAT-FR02-03`** | **AC01, AC02** | Điều hướng về **Nội tổng quát** khi triệu chứng chung chung | Thực hiện 2 lượt chat với triệu chứng mệt mỏi chung. | 1. `"Tôi cảm thấy mệt mỏi, chán ăn"`<br>2. `"Từ đầu tuần đến giờ"` | - Hệ thống ánh xạ về chuyên khoa mặc định an toàn: `specialty: "Nội tổng quát"`.<br>- Giao diện hiển thị rõ: **`Chuyên khoa gợi ý: Nội tổng quát`**. |
| **`UAT-FR02-04`** | **AC03** | Kiểm tra kết quả **không** chứa chẩn đoán bệnh hoặc phác đồ điều trị | Kiểm tra nội dung văn bản trả về ở trường `reply` và giao diện trong tất cả các kịch bản `UAT-FR02-01..03`. | Mọi kịch bản triệu chứng | - Nội dung phản hồi chỉ gợi ý chuyên khoa tham khảo và luôn kèm câu khẳng định: *"Đây không phải chẩn đoán y khoa."*<br>- Tuyệt đối không kết luận tên bệnh lý hay khuyên dùng thuốc/điều trị. |

---

### 3.3. `FR-03`: Doctor Navigation
> **Đặc tả:** Bệnh nhân có thể sử dụng chuyên khoa được đề xuất để tiếp tục tìm bác sĩ. Kết quả tìm kiếm phải lấy từ danh sách bác sĩ thực tế trong hệ thống.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR03-01`** | **AC01, AC02** | Hiển thị danh sách bác sĩ lọc theo đúng chuyên khoa được đề xuất và chuyển sang bước đặt lịch | 1. Hoàn tất 2 lượt tư vấn ra chuyên khoa `Da liễu`.<br>2. Quan sát danh sách bác sĩ hiển thị ngay dưới chuyên khoa gợi ý.<br>3. Bấm nút **Chọn bác sĩ & xem lịch**. | Chuyên khoa kết quả: `Da liễu` | - Chỉ hiển thị bác sĩ có chuyên khoa `Da liễu` (`BS. Nguyễn Minh An (Demo)`), không lẫn bác sĩ `Tim mạch` hay `Nội tổng quát`.<br>- Bấm nút điều hướng mở đúng hồ sơ/lịch khám của bác sĩ đó. |
| **`UAT-FR03-02`** | **AC03** | Bảo đảm AI không bao giờ tự bịa tên bác sĩ hoặc lịch khám không có trong Database | 1. Bật `OPENAI_API_KEY` (hoặc dùng chế độ fallback).<br>2. Nhập yêu cầu tìm chuyên khoa không tồn tại trong DB (ví dụ: `"Tôi muốn tìm bác sĩ chuyên khoa Thần kinh Vũ trụ"`). | `"Tìm bác sĩ chuyên khoa Ngoại Thần kinh"` | - Danh sách `doctors` luôn được truy vấn từ bảng `public.doctors` trong PostgreSQL.<br>- Nếu DB không có bác sĩ khớp, trả về `doctors: []` và hiển thị *"Chưa có bác sĩ phù hợp trong danh mục"*, tuyệt đối không tự sinh tên bác sĩ hay khung giờ ảo từ LLM. |

---

### 3.4. `FR-04`: Emergency Handling & Fallback
> **Đặc tả:** Hệ thống nhận diện các dấu hiệu cảnh báo khẩn cấp thuộc phạm vi được định nghĩa. Khi gặp trường hợp này, chatbot hiển thị hướng dẫn tìm kiếm hỗ trợ y tế khẩn cấp thay vì điều hướng đến đặt lịch thông thường. Khi AI không hoạt động, hệ thống có cơ chế fallback.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR04-01`** | **AC01, AC02** | Kích hoạt cảnh báo khẩn cấp với triệu chứng tiếng Việt (ngay ở Lượt 1 hoặc Lượt 2) | Nhập một trong các cụm từ cảnh báo khẩn cấp vào Chatbot (`/api/consult`) hoặc ô tìm kiếm Assistant (`/api/assistant`). | - `"Tôi bị đau ngực dữ dội"`<br>- `"Khó thở nghiêm trọng"`<br>- `"Khó thở cấp tính"`<br>- `"Bệnh nhân bị bất tỉnh"`<br>- `"Co giật liên tục"`<br>- `"Chảy máu không cầm"` | - Kích hoạt nhánh khẩn cấp: `urgent: true`, `followUpRequired: false`.<br>- Hiển thị cảnh báo đỏ (`role="alert"`): *"Nếu có dấu hiệu nguy hiểm, hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất."*<br>- **Không** gợi ý chuyên khoa (`specialty: null`) và **không** hiển thị danh sách bác sĩ đặt lịch thông thường (`doctors: []`). |
| **`UAT-FR04-02`** | **AC01, AC02** | Kích hoạt cảnh báo khẩn cấp với triệu chứng tiếng Anh | Nhập triệu chứng cấp cứu bằng tiếng Anh. | - `"I have severe chest pain"`<br>- `"difficulty breathing"`<br>- `"unconscious"` | - Trả về `urgent: true`, `doctors: []`, hiển thị thông báo cấp cứu 115, ẩn luồng đặt lịch thông thường. |
| **`UAT-FR04-03`** | **AC03, AC04** | Cơ chế Fallback khi thiếu `OPENAI_API_KEY` | 1. Để trống `OPENAI_API_KEY` trong `backend/.env`.<br>2. Gọi `POST /api/assistant` hoặc `POST /api/consult` với `"Tìm bác sĩ da liễu Thủ Đức"`. | `OPENAI_API_KEY=""` | - Hệ thống không báo lỗi mà tự động dùng bộ lọc fallback (`conservative_filters`).<br>- Trả về `HTTP 200` với bác sĩ Da liễu phù hợp.<br>- Cờ phân biệt **`usedAI: false`** (phân biệt rõ với kết quả có AI hỗ trợ `usedAI: true`). |
| **`UAT-FR04-04`** | **AC03, AC04** | Cơ chế Fallback khi OpenAI API bị timeout hoặc trả dữ liệu lỗi | Giả lập `OPENAI_API_KEY` không hợp lệ hoặc mất kết nối tới `api.openai.com`. | `OPENAI_API_KEY="sk-invalid-key"` | - Backend bắt ngoại lệ (`httpx.HTTPError` / `ValueError`), tự động chuyển sang fallback từ khóa, trả về `HTTP 200` với `usedAI: false`. |

---

## 4. Phần 2: US-02 — Doctor Discovery & Appointment Booking (`FR-05` → `FR-11`)

> **User Story:** *"Là bệnh nhân, tôi muốn tìm kiếm bác sĩ, xem lịch trống và đặt lịch với bác sĩ phù hợp, để có thể lên lịch khám thuận tiện."*

---

### 4.1. `FR-05`: Doctor Listing & Specialty Filtering
> **Đặc tả:** Hệ thống hiển thị danh sách bác sĩ theo chuyên khoa đã chọn hoặc được chatbot đề xuất. Bệnh nhân có thể xem và lựa chọn bác sĩ.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR05-01`** | **AC01, AC03** | Danh sách bác sĩ chỉ hiển thị bác sĩ đang `active` kèm tối thiểu Tên và Chuyên khoa | 1. Trong DB có 3 bác sĩ `active = true` và thử đặt 1 bác sĩ thành `active = false`.<br>2. Mở danh sách bác sĩ (`GET /api/doctors`). | Không truyền filter | - Chỉ hiển thị các bác sĩ có `active = true` (sắp xếp ổn định theo `id ASC`).<br>- Mỗi thẻ bác sĩ hiển thị rõ họ tên (`name`) và chuyên khoa (`specialty`). |
| **`UAT-FR05-02`** | **AC02** | Lọc chính xác bác sĩ theo chuyên khoa (hỗ trợ có dấu, không dấu và tiếng Anh) | Chọn hoặc truyền query `specialty` trên danh sách bác sĩ. | - `specialty=Da liễu`<br>- `specialty=da lieu`<br>- `specialty=dermatology` | - Cả 3 cách lọc đều trả về đúng bác sĩ chuyên khoa `Da liễu` (`BS. Nguyễn Minh An (Demo)`). |
| **`UAT-FR05-03`** | **AC02** | Kết hợp lọc theo Chuyên khoa, Khu vực (`district`) và Từ khóa (`keyword`) | Tìm kiếm với `specialty=Da liễu&district=Thủ Đức` hoặc `keyword=Minh An`. | `district=Thủ Đức`, `specialty=Da liễu` | - Các điều kiện lọc kết hợp theo phép `AND`; trả về đúng bác sĩ thỏa mãn tất cả điều kiện. |
| **`UAT-FR05-04`** | **AC04** | Hiển thị Empty State khi không có bác sĩ khớp điều kiện | Lọc theo chuyên khoa hoặc khu vực chưa có bác sĩ (ví dụ: `specialty=Nha khoa` hoặc `district=Quận 9`). | `specialty=Nha khoa` | - API trả về `HTTP 200` với `{"doctors": [], "demoMode": false}`.<br>- Giao diện hiển thị thông báo trống (Empty State) rõ ràng, tuyệt đối **không** hiển thị bác sĩ giả để lấp chỗ trống. |

---

### 4.2. `FR-06`: Doctor Profile
> **Đặc tả:** Khi chọn một bác sĩ, bệnh nhân xem được thông tin hồ sơ cần thiết để đưa ra lựa chọn.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR06-01`** | **AC01, AC02, AC03** | Xem hồ sơ bác sĩ có đầy đủ thông tin, chứng chỉ và điểm đánh giá | Chọn `BS. Nguyễn Minh An (Demo)` (`10000000-0000-4000-8000-000000000001`). | Bác sĩ 1 | Hiển thị đầy đủ:<br>- Họ tên: `BS. Nguyễn Minh An (Demo)` & Chuyên khoa: `Da liễu` (`AC01`).<br>- Giới thiệu (`bio`), Địa chỉ (`address`: `Địa chỉ minh họa A, TP.HCM`), Khu vực (`district`: `Thủ Đức`) (`AC02`).<br>- Chứng chỉ (`certificates`): `Chứng chỉ da liễu (Demo) — Đơn vị minh họa (2024)` (`AC03`).<br>- Điểm đánh giá: `4.5` (`2` đánh giá). |
| **`UAT-FR06-02`** | **AC03, AC04** | Xem hồ sơ bác sĩ **chưa có đánh giá** (`rating: null`, `ratingCount: 0`) và chưa có chứng chỉ | Chọn `BS. Trần Hoàng Mai (Demo)` (có chứng chỉ, chưa có rating) và `BS. Lê Quốc Bình (Demo)` (`certificates: []`, `rating: null`, `ratingCount: 0`). | Bác sĩ 2 & Bác sĩ 3 | - Khi `rating === null` và `ratingCount === 0`, giao diện hiển thị rõ trạng thái **"Chưa có đánh giá"** (không hiển thị `0 sao` hay `null/5`) (`AC04`).<br>- Khi `certificates` là `[]`, hiển thị trạng thái chưa cập nhật chứng chỉ hoặc ẩn gọn mà không lỗi giao diện (`AC03`). |
| **`UAT-FR06-03`** | **AC05** | Chuyển tiếp từ Hồ sơ bác sĩ sang bước Xem lịch khám | Từ màn hình chi tiết bác sĩ, bấm nút **Đặt lịch khám / Xem lịch trống**. | Bác sĩ đang chọn | Chuyển sang giao diện chọn ngày & khung giờ khám của đúng bác sĩ đó. |
| **`UAT-FR06-04`** | Negative | Truy cập hồ sơ bác sĩ không tồn tại hoặc đã `inactive` | Mở URL `/api/doctors/10000000-0000-4000-8000-000000000099`. | UUID không tồn tại | Trả về `HTTP 404` `{"error": "Doctor not found"}` và hiển thị thông báo không tìm thấy bác sĩ. |

---

### 4.3. `FR-07`: Appointment Availability
> **Đặc tả:** Bệnh nhân xem lịch ngày và các khung giờ có thể đặt của bác sĩ đã chọn.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR07-01`** | **AC01** | Chỉ hiển thị các slot hợp lệ (Bác sĩ active, `is_published = true`, ở tương lai, chưa có lịch hẹn chưa hủy) | 1. Chuẩn bị cho Bác sĩ 1:<br>- Slot A: ở tương lai, chưa ai đặt<br>- Slot B: ở quá khứ<br>- Slot C: `is_published = false`<br>- Slot D: đã có lịch hẹn `requested` hoặc `confirmed`<br>- Slot E: từng có lịch hẹn nhưng đã `cancelled` (và vẫn ở tương lai)<br>2. Xem danh sách slot (`GET /api/doctors/{id}/slots`). | `doctorId` của Bác sĩ 1 | - Chỉ **Slot A** và **Slot E** được hiển thị cho bệnh nhân.<br>- **Slot B** (quá khứ), **Slot C** (chưa công bố) và **Slot D** (đã có lịch chưa hủy) bị loại bỏ hoàn toàn trước khi trả về. |
| **`UAT-FR07-02`** | **AC02** | Danh sách slot được sắp xếp theo thời gian tăng dần | Quan sát thứ tự các ngày và khung giờ trống của Bác sĩ 1. | Bác sĩ có các khung giờ `09:00`, `10:00`, `14:00` trong 5 ngày tới | Các slot được sắp xếp tăng dần theo `start_at ASC, id ASC` (`09:00` → `10:00` → `14:00` của ngày 1 rồi đến ngày 2...). |
| **`UAT-FR07-03`** | **AC03** | Thời gian khung giờ hiển thị theo múi giờ Việt Nam (`Asia/Ho_Chi_Minh`) | Kiểm tra slot có `startAt = "2026-11-05T02:00:00Z"` (UTC) trên giao diện trình duyệt. | `2026-11-05T02:00:00Z` | Giao diện chuyển đổi và hiển thị đúng **`09:00` ngày `05/11/2026`** (UTC+7). |
| **`UAT-FR07-04`** | **AC04** | Hiển thị thông báo phù hợp khi bác sĩ hết slot trống | Chọn một bác sĩ đang active nhưng không còn slot nào ở tương lai. | Bác sĩ hết slot | API trả `{"slots": [], "demoMode": false}`; giao diện hiển thị thông báo bác sĩ hiện chưa có khung giờ trống. |
| **`UAT-FR07-05`** | **AC05** | Chọn slot trên giao diện không khóa/giữ chỗ slot của người khác | 1. Bệnh nhân A mở trang và bấm chọn vào khung giờ `09:00` nhưng **chưa** bấm gửi form đặt lịch.<br>2. Bệnh nhân B mở trang xem lịch của cùng bác sĩ. | Cùng khung giờ `09:00` | Bệnh nhân B vẫn nhìn thấy và có thể đặt khung giờ `09:00` bình thường (việc chọn trên UI chỉ là trạng thái chọn tạm ở trình duyệt, chưa tạo giữ chỗ trong DB). |

---

### 4.4. `FR-08`: Patient Information & Booking Submission
> **Đặc tả:** Bệnh nhân chọn slot và nhập thông tin đặt lịch. Không yêu cầu đăng ký tài khoản bệnh nhân trong MVP.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR08-01`** | **AC01, AC02, AC04** | Đặt lịch không cần đăng nhập tài khoản, xem lại thông tin trước khi gửi | 1. Truy cập trang đặt lịch ở chế độ ẩn danh (chưa đăng nhập).<br>2. Chọn bác sĩ và khung giờ.<br>3. Nhập Họ tên, Số điện thoại, để trống Ghi chú.<br>4. Kiểm tra thông tin tóm tắt (Bác sĩ, Ngày, Giờ, Họ tên, SĐT) trước khi bấm Xác nhận. | - Họ tên: `Nguyễn Văn Demo`<br>- SĐT: `0901234567`<br>- Ghi chú: `""` (bỏ trống) | - Không yêu cầu đăng nhập tài khoản bệnh nhân.<br>- Hiển thị đầy đủ thông tin bác sĩ, ngày giờ và thông tin người đặt để kiểm tra lại trước khi gửi.<br>- Cho phép gửi thành công khi `notes` để trống (`AC02`). |
| **`UAT-FR08-02`** | **AC03, AC05** | Kiểm tra lỗi khi bỏ trống hoặc nhập Họ tên quá ngắn / quá dài | Nhập `patientName` là `""`, `"   "`, `"A"` (1 ký tự), hoặc chuỗi 101 ký tự. | `patientName`: `"  A  "` | Hệ thống chặn và báo lỗi validation (`HTTP 422`) tại trường Họ tên (yêu cầu từ 2–100 ký tự sau khi chuẩn hóa NFC và cắt khoảng trắng đầu/cuối). |
| **`UAT-FR08-03`** | **AC03, AC05** | Kiểm tra định dạng Số điện thoại (Regex + Tối thiểu 9 chữ số ASCII) | Thử gửi form với các số điện thoại không hợp lệ:<br>1. Chứa chữ cái: `"0901234abc"`<br>2. Quá ngắn: `"09012345"` (8 số)<br>3. Đủ 9–20 ký tự hợp lệ nhưng dưới 9 chữ số thực: `"+()---()---123"` | Các mẫu SĐT sai bên trái | Hệ thống từ chối (`HTTP 422`) và hiển thị lỗi tại trường Số điện thoại. |
| **`UAT-FR08-04`** | **AC03** | Chấp nhận Số điện thoại có mã quốc gia `+84` hoặc dấu cách/gạch ngang hợp lệ | Nhập SĐT định dạng `"+84 (90) 123-4567"` hoặc `"090 123 4567"`. | `"+84 (90) 123-4567"` | Hệ thống chấp nhận hợp lệ (thỏa regex `^\+?[0-9 ()-]{9,20}$` và có $\ge 9$ chữ số ASCII), giữ nguyên số `0` hoặc dấu `+` đầu. |
| **`UAT-FR08-05`** | **AC03, AC05** | Kiểm tra giới hạn trường Ghi chú (`notes` $\le 500$ ký tự) | Nhập 501 ký tự vào ô Ghi chú và gửi. | Chuỗi 501 ký tự | Hệ thống từ chối (`HTTP 422`) và báo lỗi tại trường Ghi chú. |

---

### 4.5. `FR-09`: Booking Persistence & Double-booking Prevention
> **Đặc tả:** Hệ thống lưu lịch hẹn vào database và bảo đảm một slot không được có hai lịch hẹn chưa bị hủy.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR09-01`** | **AC01, AC02** | Lưu lịch hẹn bền vững vào Database và giữ nguyên sau khi tải lại trang | 1. Đặt lịch hợp lệ cho 1 slot trống.<br>2. Nhấn `F5` tải lại trang danh sách slot của bác sĩ.<br>3. Kiểm tra trong bảng `public.appointments` trên Supabase. | Slot hợp lệ + Thông tin bệnh nhân hợp lệ | - Bản ghi được tạo trong bảng `public.appointments` (`AC01`).<br>- Sau khi tải lại trang, slot đó không còn xuất hiện trong danh sách slot trống; lịch hẹn vẫn tồn tại bền vững trong DB (`AC02`). |
| **`UAT-FR09-02`** | **AC03, AC04** | Chặn đặt trùng khi 2 bệnh nhân gửi yêu cầu đặt cùng 1 slot đồng thời (Race Condition) | Thực thi đồng thời 2 request `POST /api/appointments` vào cùng một `slotId`:<br>```bash
SLOT_ID="<UUID-SLOT-TRỐNG>"
(curl -s -w "\nHTTP:%{http_code}\n" -X POST http://localhost:3000/api/appointments -H "Content-Type: application/json" -d "{\"slotId\":\"$SLOT_ID\",\"patientName\":\"Bệnh nhân A\",\"patientPhone\":\"0901111111\"}") & \
(curl -s -w "\nHTTP:%{http_code}\n" -X POST http://localhost:3000/api/appointments -H "Content-Type: application/json" -d "{\"slotId\":\"$SLOT_ID\",\"patientName\":\"Bệnh nhân B\",\"patientPhone\":\"0902222222\"}") & \
wait
``` | Cùng `slotId` cho 2 request chạy song song | - Nhờ khóa `FOR UPDATE` trong RPC `create_appointment` và partial unique index `appointments_one_active_per_slot`, **chỉ đúng 1 request trả về `HTTP 201`**.<br>- Request còn lại trả về **`HTTP 409 Conflict`** với `{"error": "Slot is no longer available"}`.<br>- Trong DB chỉ có duy nhất 1 dòng lịch hẹn chưa hủy cho slot đó. |

---

### 4.6. `FR-10`: Booking Result & Confirmation (`requested` = "Chờ xác nhận")
> **Đặc tả:** Sau khi gửi booking thành công, bệnh nhân nhìn thấy kết quả và mã tham chiếu đặt lịch.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR10-01`** | **AC01, AC02** | Hiển thị đầy đủ Mã tham chiếu (`bookingReference`) và thông tin chi tiết sau khi đặt lịch | Đặt lịch thành công và kiểm tra màn hình kết quả. | Booking hợp lệ | - Hiển thị rõ mã tham chiếu `bookingReference` gồm 12 ký tự hex in hoa (`^[0-9A-F]{12}$`, ví dụ `A1B2C3D4E5F6`) (`AC01`).<br>- Hiển thị đầy đủ tên bác sĩ, chuyên khoa, ngày, giờ và địa điểm khám (`AC02`). |
| **`UAT-FR10-02`** | **AC03, AC04** | Trạng thái ban đầu là **`requested` ("Chờ xác nhận")**, không báo "Đã xác nhận" khi Staff chưa duyệt | Kiểm tra giá trị `status` trong JSON response của `POST /api/appointments` và nhãn trạng thái trên màn hình kết quả của bệnh nhân. | Booking mới tạo | - Trong API response và DB: `status` là **`"requested"`**.<br>- Trên giao diện: Hiển thị nhãn trạng thái là **“Chờ xác nhận”** (`AC03`).<br>- Tuyệt đối **không** hiển thị là “Đã xác nhận” (`confirmed`) trước khi nhân viên thực hiện thao tác xác nhận (`AC04`). |

---

### 4.7. `FR-11`: Booking Error Handling
> **Đặc tả:** Hệ thống xử lý các trường hợp slot vừa bị đặt, dữ liệu sai hoặc dịch vụ tạm thời không khả dụng.

| Mã TC | Tiêu chí (AC) | Tên Test Case | Các bước thực hiện (Test Steps) | Dữ liệu Đầu vào | Kết quả Mong đợi (Expected Result) |
| :--- | :---: | :--- | :--- | :--- | :--- |
| **`UAT-FR11-01`** | **AC01** | Xử lý khi slot vừa bị người khác đặt mất (`HTTP 409`) | 1. Mở sẵn form đặt lịch của Slot X ở Tab 1.<br>2. Ở Tab 2, hoàn tất đặt lịch cho Slot X.<br>3. Quay lại Tab 1 bấm gửi form. | Slot X đã bị đặt ở Tab 2 | - Backend trả về `HTTP 409`.<br>- Giao diện Tab 1 thông báo khung giờ không còn khả dụng, bỏ chọn slot cũ và tải lại danh sách khung giờ mới nhất. |
| **`UAT-FR11-02`** | **AC02** | Hiển thị lỗi validation (`HTTP 422`) đúng trường dữ liệu | Gửi dữ liệu sai ở `patientName` hoặc `patientPhone`. | Tên 1 ký tự hoặc SĐT sai | Giao diện đọc cấu trúc `detail[].loc` của lỗi `422` và hiển thị thông báo lỗi tương ứng với trường bị sai. |
| **`UAT-FR11-03`** | **AC03** | Không bao giờ báo đặt lịch thành công khi Database lỗi hoặc chưa cấu hình (`HTTP 503`) | Tạm dừng kết nối Supabase (hoặc xóa `SUPABASE_URL` / đặt `BOOKING_RPC_V2_READY=false`) rồi bấm Đặt lịch. | Mất kết nối DB | - Backend trả về `HTTP 503 Service Unavailable`.<br>- Giao diện hiển thị thông báo dịch vụ tạm thời không sẵn sàng, **không** chuyển sang màn hình đặt lịch thành công. |
| **`UAT-FR11-04`** | **AC04** | Chặn gửi lặp liên tục khi người dùng bấm đúp (Double-click) vào nút Đặt lịch | Bấm liên tiếp nhiều lần thật nhanh vào nút **Xác nhận đặt lịch** khi request đang xử lý. | Double-click nút Submit | Nút gửi chuyển sang trạng thái đang xử lý (`disabled / busy`) ngay từ cú click đầu tiên, ngăn gửi nhiều request trùng lặp. |

---

## 5. Phần 3: Kiểm thử Bộ Trạng thái Lịch hẹn & Phân quyền Nhân viên theo API v2

### Bảng quy ước trạng thái chuẩn (API v2):

| Status trong DB / API | Nhãn giao diện gợi ý | Các trạng thái đích có thể chuyển tới |
| :--- | :--- | :--- |
| **`requested`** | Chờ xác nhận | `confirmed`, `cancelled` |
| **`confirmed`** | Đã xác nhận | `checked_in`, `cancelled` |
| **`checked_in`** | Đã đến khám | `completed`, `cancelled` |
| **`completed`** | Hoàn tất | *Không có (Trạng thái kết thúc)* |
| **`cancelled`** | Đã hủy | *Không có (Trạng thái kết thúc)* |

### Danh sách Test Cases chuyển trạng thái & phân quyền Staff:

| Mã TC | Mục tiêu kiểm thử | Các bước thực hiện | Kết quả Mong đợi |
| :--- | :--- | :--- | :--- |
| **`UAT-STATE-01`** | Luồng chuyển trạng thái chuẩn từ đầu đến hoàn tất (`requested` → `confirmed` → `checked_in` → `completed`) | 1. Bệnh nhân đặt lịch mới → trạng thái `requested` (*Chờ xác nhận*).<br>2. Staff bấm chuyển sang `confirmed` (*Đã xác nhận*).<br>3. Staff bấm chuyển sang `checked_in` (*Đã đến khám*).<br>4. Staff bấm chuyển sang `completed` (*Hoàn tất*). | - Mỗi bước `PATCH /api/appointments/{id}` trả về `HTTP 200` với `{"appointment": {"id": "...", "status": "<trạng-thái-mới>"}}`.<br>- Khi đã ở `completed`, không còn nút chuyển trạng thái nào xuất hiện trên UI. |
| **`UAT-STATE-02`** | Hủy lịch hẹn từ các trạng thái đang mở (`requested`, `confirmed`, `checked_in` → `cancelled`) và giải phóng Slot | 1. Tạo 3 lịch hẹn ở các trạng thái `requested`, `confirmed`, `checked_in`.<br>2. Staff lần lượt bấm chuyển cả 3 sang `cancelled` (*Đã hủy*).<br>3. Kiểm tra lại danh sách slot trống của bác sĩ (`GET /api/doctors/{id}/slots`). | - Cả 3 thao tác hủy đều trả về `HTTP 200` (`status: "cancelled"`).<br>- Các slot có lịch hẹn vừa bị hủy (nếu thời gian `start_at` vẫn còn ở tương lai và bác sĩ `active`) **lập tức xuất hiện trở lại** để bệnh nhân khác có thể đặt lại. |
| **`UAT-STATE-03`** | Chặn các bước chuyển trạng thái nhảy cóc hoặc ngược chiều (`HTTP 409`) | Thử gọi `PATCH /api/appointments/{id}` với các bước chuyển sai quy tắc:<br>- `requested` → `checked_in` hoặc `completed`<br>- `confirmed` → `completed`<br>- `completed` → `cancelled` hoặc `confirmed`<br>- `cancelled` → `confirmed`<br>- Gửi lại chính trạng thái hiện tại (`confirmed` → `confirmed`) | Tất cả đều bị chặn và trả về **`HTTP 409 Conflict`** (`{"error": "Invalid status transition"}`). |
| **`UAT-STATE-04`** | Chặn truyền trạng thái đích là `requested` hoặc giá trị ngoài tập hợp lệ (`HTTP 422`) | Gọi `PATCH /api/appointments/{id}` với body `{"status": "requested"}` hoặc `{"status": "pending"}` hoặc `{"status": null}`. | Trả về **`HTTP 422 Unprocessable Entity`** do vi phạm schema `StatusInput`. |
| **`UAT-STATE-05`** | Phân quyền Staff theo Bác sĩ được gán (`NFR-04`) | 1. Staff 1 chỉ được gán quyền với Bác sĩ 1 trong bảng `staff_members`.<br>2. Staff 1 gọi `GET /api/staff/appointments` và thử `PATCH` một lịch hẹn thuộc Bác sĩ 2. | - `GET /api/staff/appointments` chỉ trả về lịch hẹn của Bác sĩ 1.<br>- Khi cố `PATCH` lịch hẹn của Bác sĩ 2, hệ thống trả về **`HTTP 403 Forbidden`**. |
| **`UAT-STATE-06`** | Xử lý tranh chấp khi 2 nhân viên cùng cập nhật trạng thái 1 lịch hẹn đồng thời | Hai nhân viên cùng mở danh sách ở trạng thái `requested`. Nhân viên A bấm `confirmed` trước, Nhân viên B bấm `cancelled` ngay sau đó. | Cờ điều kiện trạng thái cũ bảo vệ giao dịch: một người thành công (`200`), người còn lại nhận `HTTP 409 Conflict` và được yêu cầu tải lại danh sách. |

---

## 6. Phần 4: Kiểm thử Yêu cầu Phi chức năng & Quy tắc Nghiệp vụ Dùng chung (`NFR-01` → `NFR-07`)

| Mã TC | Mã NFR | Tên Yêu cầu | Phương pháp Kiểm thử & Thao tác | Tiêu chuẩn Nghiệm thu (Acceptance Criteria) |
| :--- | :---: | :--- | :--- | :--- |
| **`UAT-NFR-01`** | **NFR-01** | **Data Persistence** (Lưu trữ bền vững) | Tạo slot mới và đặt lịch hẹn, sau đó nhấn `F5` trình duyệt hoặc khởi động lại tiến trình Frontend/Backend. | Toàn bộ dữ liệu lịch khám và lịch hẹn được lưu trong Supabase PostgreSQL; việc tải lại trang hoặc khởi động lại ứng dụng không làm mất dữ liệu. |
| **`UAT-NFR-02`** | **NFR-02** | **Data Consistency** (Tính nhất quán dữ liệu) | Bỏ qua giao diện Frontend, dùng `curl` hoặc script bắn trực tiếp nhiều request `POST /api/appointments` vào cùng 1 `slotId` tại Backend. | Một slot chỉ có tối đa 1 appointment chưa hủy (`status <> 'cancelled'`). Ràng buộc được đảm bảo trực tiếp ở tầng Backend/Database (`appointments_one_active_per_slot`), không phụ thuộc vào kiểm tra ở Frontend. |
| **`UAT-NFR-03`** | **NFR-03** | **Timezone** (Chuẩn hóa múi giờ) | 1. Kiểm tra JSON trả về từ `/api/doctors/{id}/slots` và `/api/staff/appointments`.<br>2. Đối chiếu với giờ hiển thị trên giao diện người dùng. | - Backend trả về chuỗi ISO 8601 có múi giờ chuẩn hóa UTC (ví dụ `2026-11-05T02:00:00Z`).<br>- Giao diện hiển thị đúng giờ địa phương Việt Nam `Asia/Ho_Chi_Minh` (`09:00` sáng). |
| **`UAT-NFR-04`** | **NFR-04** | **Authorization & Data Privacy** (Phân quyền & Bảo mật dữ liệu) | 1. Kiểm tra mã nguồn `frontend/`, biến môi trường và tab Network của trình duyệt.<br>2. Kiểm tra response của `/api/doctors` và `/api/staff/appointments`.<br>3. Kiểm tra Console log của trình duyệt. | - Không xuất hiện `SUPABASE_SERVICE_ROLE_KEY` hay `OPENAI_API_KEY` ở Frontend.<br>- Staff chỉ truy cập được dữ liệu của bác sĩ được phân quyền.<br>- Endpoint `/api/staff/appointments` chỉ trả các trường trong contract, không lộ thông tin nhạy cảm thừa; Frontend không log thông tin cá nhân bệnh nhân ra Console. |
| **`UAT-NFR-05`** | **NFR-05** | **Error Handling** (Xử lý mã lỗi chuẩn) | Kích hoạt lần lượt các mã lỗi `401`, `403`, `404`, `409`, `422`, `503` từ Backend và quan sát phản ứng của Frontend. | Frontend phân nhánh xử lý đúng theo mã HTTP status và cấu trúc JSON (`{"error": "..."}` hoặc `{"detail": [...]}`), **tuyệt đối không** hiển thị thông báo thành công khi Backend trả lỗi. |
| **`UAT-NFR-06`** | **NFR-06** | **Data Integrity** (Toàn vẹn dữ liệu ở DB) | Thử thực thi các câu lệnh INSERT/UPDATE vi phạm ràng buộc trong DB:<br>- Tạo 2 slot giao thời gian nhau của cùng 1 bác sĩ<br>- Chèn `rating = 4.5` nhưng `rating_count = 0`<br>- Chèn `status` ngoài 5 giá trị cho phép | PostgreSQL chặn hoàn toàn nhờ các constraint: `appointment_slots_no_overlap` (GiST), `doctors_rating_consistency_check`, `appointments_status_check`, và các khóa ngoại `ON DELETE RESTRICT`. |
| **`UAT-NFR-07`** | **NFR-07** | **Demo Data Transparency** (Minh bạch dữ liệu Demo) | Kiểm tra cờ `demoMode` trong các phản hồi API và thử đặt lịch khi chưa cấu hình Database. | Nếu sử dụng dữ liệu demo, hệ thống gắn cờ `demoMode: true` rõ ràng; khi Database không khả dụng, thao tác đặt lịch trả về `HTTP 503`, không bao giờ tạo kết quả đặt lịch thành công giả. |

---

## 7. Phần 5: Kịch bản UAT End-to-End Liên thông (Từ Triệu chứng → Đặt lịch `requested` → Staff Xác nhận `confirmed`)

Đây là kịch bản kiểm thử tích hợp xuyên suốt toàn bộ hệ thống để trình diễn trước Product Owner:

| Bước | Vai trò | Hành động trên Hệ thống | Kết quả Kiểm chứng (Pass Criteria) |
| :---: | :--- | :--- | :--- |
| **1** | **Patient** | Mở Chatbot tư vấn, nhập `"Tôi bị nổi mẩn đỏ và ngứa ở cổ"` → Sau khi Chatbot hỏi câu hỏi bổ sung, trả lời `"Bị khoảng 2 ngày nay"`. | - Lượt 1: Chatbot hỏi thêm thông tin (`FR-01 AC03`).<br>- Lượt 2: Chatbot gợi ý chuyên khoa **`Da liễu`**, kèm tuyên bố không chẩn đoán bệnh (`FR-02 AC01..03`). |
| **2** | **Patient** | Từ kết quả tư vấn, chọn xem danh sách bác sĩ chuyên khoa `Da liễu` và mở hồ sơ `BS. Nguyễn Minh An (Demo)`. | - Hiển thị đúng bác sĩ `Da liễu` đang active (`FR-03`, `FR-05`).<br>- Hồ sơ hiển thị đầy đủ Tên, Chuyên khoa, Địa chỉ, Khu vực `Thủ Đức`, Chứng chỉ và Đánh giá `4.5` (`FR-06`). |
| **3** | **Patient** | Xem danh sách khung giờ trống của `BS. Nguyễn Minh An (Demo)`, chọn khung giờ `09:00` ngày mai (giờ Việt Nam). | - Các khung giờ trống ở tương lai được sắp xếp tăng dần và hiển thị đúng múi giờ `Asia/Ho_Chi_Minh` (`FR-07`). |
| **4** | **Patient** | Điền Họ tên `"Trần Thị Minh (Demo)"`, SĐT `"0912345678"`, Ghi chú `"Khám da liễu"` → Xem lại thông tin và bấm **Xác nhận đặt lịch**. | - Đặt lịch thành công (`HTTP 201`).<br>- Màn hình hiển thị mã `bookingReference` (12 ký tự hex), thông tin bác sĩ/giờ khám.<br>- Trạng thái ban đầu hiển thị đúng là **“Chờ xác nhận” (`requested`)** (`FR-08`, `FR-09`, `FR-10`). |
| **5** | **Patient 2** | Mở lại danh sách slot của `BS. Nguyễn Minh An (Demo)` hoặc gửi request đặt trùng vào khung giờ `09:00` vừa đặt. | - Khung giờ `09:00` không còn trong danh sách slot trống.<br>- Request đặt trùng nhận lỗi `HTTP 409 Conflict` (`FR-09 AC03, AC04`, `FR-11 AC01`). |
| **6** | **Clinic Staff** | Đăng nhập vào `/staff` bằng tài khoản được phân quyền cho `BS. Nguyễn Minh An (Demo)` → Xem danh sách lịch hẹn → Bấm chuyển trạng thái từ `requested` sang **`confirmed`** (*Đã xác nhận*). | - Staff nhìn thấy lịch hẹn của `Trần Thị Minh (Demo)` ở trạng thái `requested`.<br>- Sau khi bấm xác nhận, trạng thái cập nhật thành **`confirmed`** (*Đã xác nhận*) và lưu bền vững trong Supabase (`NFR-01`, `NFR-04`). |

---

## 8. Biên bản Ký Nghiệm thu UAT (UAT Sign-off Sheet)

- **Ngày thực hiện UAT:** `....../....../2026`
- **Môi trường kiểm thử:** Supabase Project `jlvdqrfnntxpbgomugdu` + Local Fullstack (`localhost:3000` / `127.0.0.1:8000`)
- **Người kiểm thử (QA/Tester):** `............................................................`
- **Người kiểm tra kỹ thuật (Tech Lead/Dev):** `............................................................`

| Nhóm Yêu cầu | Số lượng Test Case | Đạt (Pass) | Không đạt (Fail) | Ghi chú |
| :--- | :---: | :---: | :---: | :--- |
| **US-01 (`FR-01` → `FR-04`)** | 15 | | | |
| **US-02 (`FR-05` → `FR-11`)** | 24 | | | |
| **Status Matrix & Staff (`STATE`)** | 6 | | | |
| **Non-Functional (`NFR-01` → `NFR-07`)** | 7 | | | |
| **Kịch bản E2E Liên thông 6 bước** | 6 | | | |
| **Tổng cộng** | **58** | | | |

**Xác nhận của Product Owner (PO):**
- `[ ] ACCEPTED (Chấp nhận nghiệm thu)`
- `[ ] CHANGES REQUESTED (Yêu cầu chỉnh sửa)`
- **Chữ ký / Họ tên PO:** `............................................................`
