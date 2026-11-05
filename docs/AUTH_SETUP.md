# Đăng ký và đăng nhập Patient / Doctor

App dùng Supabase Auth cho mật khẩu, xác nhận email và làm mới phiên. FastAPI xác thực JWT với Supabase rồi lấy vai trò từ `patient_profiles` hoặc `doctor_accounts`. Token dùng tiếp cho đặt lịch, dashboard, lịch tuần và thông báo; frontend không tự cấp quyền từ metadata.

## Chạy local

1. `backend/.env`: đặt `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Frontend và backend phải trỏ về cùng project. Backend chỉ đọc `.env`, không đọc `.env.local`.
2. `frontend/.env.local`: đặt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_URL=http://127.0.0.1:8000`. Không đưa service-role key vào frontend.
3. Database cần các migration `001`–`005` phù hợp với trạng thái hiện có và `007_doctor_profile_registration.sql` cho đăng ký bác sĩ bằng thông tin/chứng chỉ. `006` chỉ phục vụ mã mời cũ và được giữ nguyên. Không chạy lại bootstrap hay migration đã áp dụng. Cài lại `requirements.txt` để có `python-multipart` nhận file.
4. Trong Supabase Auth → URL Configuration, thêm các redirect local đang sử dụng: `http://localhost:3000/patient/login`, `http://localhost:3000/doctor/login`, `http://127.0.0.1:3000/patient/login`, `http://127.0.0.1:3000/doctor/login`. Thêm URL HTTPS tương ứng khi triển khai. Cấu hình dịch vụ gửi email để người dùng nhận được thư xác nhận.

Từ thư mục repo, chạy hai terminal PowerShell:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn index:app --reload --port 8000
```

```powershell
cd frontend
npm.cmd run dev
```

Mở `http://localhost:3000/patient/register` hoặc `/doctor/register`. Next.js chuyển `/api/*` tới FastAPI.

## Patient

Điền tên, email, điện thoại và mật khẩu tại `/patient/register`. API tạo Auth user và hồ sơ liên kết. Giao diện yêu cầu email xác nhận, sau đó người dùng đăng nhập tại `/patient/login`. Sau đăng nhập, `/api/auth/me` trả hồ sơ thật; app dùng hồ sơ đó khi đặt lịch. Database lấy tên/điện thoại từ hồ sơ đã xác thực, không tin dữ liệu giả mạo trong booking body.

## Doctor và chứng chỉ hành nghề

Form `/doctor/register` dùng các trường như commit `1d4235252459858fed377eddf78546d645ad8aa2`: họ tên, email, số điện thoại, địa chỉ, chuyên khoa, mật khẩu/xác nhận, tên chứng chỉ, đơn vị cấp, số chứng chỉ và tài liệu PDF/ảnh. Nút `Create account` gửi dữ liệu thật; không cần mã mời hoặc chọn lịch tuần khi đăng ký.

`POST /api/auth/doctors/register` nhận multipart gồm `details` (JSON thông tin) và `evidence` (PDF/PNG/JPEG/WebP tối đa 10 MiB). Backend kiểm tra loại/kích thước/chữ ký đầu file, tạo Auth user chưa xác nhận email, upload vào bucket private `doctor-certificates`, rồi gọi RPC `register_doctor_profile` để lưu hồ sơ, số điện thoại/số chứng chỉ/đường dẫn riêng và liên kết tài khoản trong một transaction. Chỉ tên và đơn vị cấp chứng chỉ nằm trong hồ sơ public; file không có public URL. Quận/huyện chưa được form thu thập nên lưu `Chưa cập nhật`. File do người dùng cung cấp, chưa phải bằng chứng chứng chỉ đã được thẩm định.

Nếu upload hoặc RPC bị từ chối chắc chắn, backend dọn file và Auth user; vẫn thử xóa Auth user nếu Storage cleanup lỗi. Nếu mất kết nối sau khi RPC có thể đã commit, giữ cả tài khoản và file để đối soát, không tự retry. Migration `007` phải được áp dụng trước khi dùng form; backend kiểm tra bảng mới trước khi tạo Auth user.

Sau xác nhận email, đăng nhập tại `/doctor/login`, mở Working hours trong dashboard để thiết lập lịch đầu tiên bằng API `PUT /api/doctor/schedule` hiện có. Đăng ký không tự tạo lịch hoặc slot và không thay đổi các bác sĩ/lịch hẹn đã có. Giới hạn request của môi trường triển khai có thể nhỏ hơn 10 MiB; với Vercel cần kiểm tra giới hạn upload của gói triển khai trước khi nhận file lớn.

## Hành vi lỗi

- 401: thiếu token hoặc phiên không hợp lệ; yêu cầu đăng nhập lại.
- 403: sai vai trò hoặc thiếu hồ sơ liên kết. Vai trò lấy từ bảng ứng dụng, không lấy metadata do người dùng nhập.
- 409: email/hồ sơ đã đăng ký, slot bị chiếm hoặc lịch thay đổi xung đột.
- 422: dữ liệu, file chứng chỉ hoặc các khoảng lịch không hợp lệ; không phản hồi lại mật khẩu trong lỗi validation.
- 503: Auth/Storage/database chưa sẵn sàng. Nếu kết quả RPC chưa xác định, cần đối soát Auth UID; không tự retry đăng ký hoặc xóa tài khoản có thể đã commit.

## Bằng chứng trước thay đổi: luồng mã mời ngày 2026-11-05

- Backend: 38 kiểm thử qua; Ruff qua.
- Frontend: 70 kiểm thử qua; ESLint, TypeScript và production build qua.
- SQL `tests/006_doctor_invitation_issuance.sql`: qua trên Supabase, dữ liệu test rollback. Kiểm tra quyền backend-only, email chuẩn hóa, cấp lại mã, thời hạn và bác sĩ inactive.
- Tích hợp thật qua Next.js `/api` proxy → FastAPI → Supabase: đăng ký Patient/Doctor; chặn đăng nhập trước xác nhận email; sai mật khẩu; tài khoản trùng; mã mời sai và rollback Auth user; mã dùng lại; phân quyền; lịch tuần; đặt lịch `confirmed`; đặt trùng 409; snapshot hồ sơ Patient; dashboard/thông báo; sửa lịch; refresh token và logout.
- Tài khoản giả được xác nhận email bằng Admin API chỉ để kiểm thử; không gửi thư. Chưa kiểm tra việc nhận thư thực tế hoặc thao tác trên trình duyệt: công cụ Computer Use dừng vì không xác định chắc URL trình duyệt Windows.
- Migration `006` đã được áp dụng trên project Supabase đang cấu hình. Sau kiểm thử đã dọn hồ sơ/tài khoản/lịch hẹn giả và file mật khẩu tạm; giữ nguyên 12 bác sĩ, 47 slot và 8 lịch hẹn ban đầu.

## Kiểm tra luồng mới

Backend có test multipart, chuẩn hóa thông tin, file thiếu/sai loại/quá cỡ, rollback Auth/Storage và giữ tài nguyên khi RPC chưa rõ kết quả. Frontend có test multipart thật với `File`/`FormData`, không gửi lịch/mã mời, validation và response không xác định. Các test này dùng provider/HTTP giả; không chứng minh migration `007` đã áp dụng hoặc đăng ký thành công trên Supabase live.

Sau khi áp dụng `007`, script `backend/scripts/verify_auth_integration.py` kiểm tra tích hợp khi cả hai server đang mở. Script tự đăng ký hồ sơ `Auth Integration Doctor` mới và không gắn vào bác sĩ có sẵn; kiểm tra file riêng tư, đăng nhập và thiết lập lịch đầu tiên. Script ghi trạng thái/tài khoản giả và đường dẫn file vào `backend/.auth-integration-state.json` đã được gitignore để đối soát và dọn sau. Sau kiểm thử cần dọn dữ liệu theo đúng Doctor ID, file chứng chỉ riêng và các Auth UID do script tạo; không chạy script như test CI trên database đang phục vụ người dùng.

## Xác minh tích hợp migration 007 ngày 2026-11-05

- Đã áp dụng migration `007` trên project đang cấu hình qua Supabase SQL Editor, ghi vào lịch sử với tên `doctor_profile_registration`, version `20261105041234`. Connector Supabase vẫn lỗi làm mới OAuth; dashboard đang đăng nhập truy cập được. Kiểm tra trước migration: 12 bác sĩ, 3.555 slot, 13 lịch hẹn; bảng/RPC/bucket của `007` chưa tồn tại.
- Kiểm tra sau migration: RLS bật cho `doctor_registration_details`; `anon` và `authenticated` không được SELECT bảng hoặc EXECUTE RPC đăng ký, `service_role` được EXECUTE. Bucket `doctor-certificates` private, giới hạn 10 MiB, chỉ nhận PDF/PNG/JPEG/WebP. HTTP thực tế từ chối URL công khai của chứng chỉ (400) và đọc bảng bằng anonymous (401).
- Script tích hợp đã qua qua frontend `http://127.0.0.1:3001` → backend `http://127.0.0.1:8001` → Supabase: đăng ký Patient/Doctor; chặn đăng nhập khi chưa xác nhận email; sai mật khẩu; email trùng; file chứng chỉ không hợp lệ; lưu và tải lại file private; phân quyền; GET lịch chưa thiết lập trả 404; PUT lịch đầu tiên; đặt lịch, đặt trùng, snapshot hồ sơ, thông báo, đổi lịch, refresh và logout. Chỉ xác nhận email các tài khoản giả bằng Admin API; không gửi thư thật.
- Computer Use đã kiểm tra form `/doctor/register`: thông tin cá nhân và chứng chỉ hiển thị đúng, cuộn tới file/nút đăng ký được, không có mã mời/lịch tuần; gửi form rỗng hiển thị lỗi ở đúng trường và yêu cầu tài liệu chứng chỉ. Không tạo tài khoản qua thao tác UI; bằng chứng đăng ký thành công đến từ bài tích hợp HTTP ở trên. Chrome có cảnh báo hydration do extension chèn thuộc tính `crxlauncher` vào HTML; không thay đổi cấu hình extension hoặc code ngoài phạm vi.
- Người dùng chọn **giữ dữ liệu giả để kiểm tra**: hồ sơ `Auth Integration Doctor` ID `75e11a95-7055-46a8-ac22-f970fc20ce24`, hai tài khoản giả và file chứng chỉ/lịch tuần đi kèm. Lịch hẹn thử ID `e529a40b-960b-48f5-8909-2efb66dac18e` đã được bài kiểm thử chuyển sang `cancelled`. Thông tin đăng nhập ở `backend/.auth-integration-state.json` (đã gitignore); không đưa mật khẩu/token vào tài liệu hoặc Git. Không chạy lại script tới khi đối soát dữ liệu này.
- Kiểm tra cuối: ngoài hồ sơ thử vẫn có 12 bác sĩ và 3.555 slot. Có thêm hai lịch hẹn ở bác sĩ khác với thời điểm tạo 11:08:44 và 11:16:02 giờ Việt Nam, nên số lịch hẹn ngoài bài thử là 15 thay vì baseline 13; đây là dữ liệu phát sinh đồng thời, không thuộc Doctor ID của bài thử và được giữ nguyên. File chứng chỉ, hồ sơ và lịch hẹn giả vẫn tồn tại đúng theo lựa chọn của người dùng.
