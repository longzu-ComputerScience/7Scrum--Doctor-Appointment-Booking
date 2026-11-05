# Đăng ký và đăng nhập Patient / Doctor

App dùng Supabase Auth cho mật khẩu và làm mới phiên. Đăng ký xong có thể đăng nhập ngay, không cần xác nhận email. FastAPI xác thực JWT với Supabase rồi lấy vai trò từ `patient_profiles` hoặc `doctor_accounts`. Token dùng tiếp cho đặt lịch, dashboard, lịch tuần và thông báo; frontend không tự cấp quyền từ metadata.

## Chạy local

1. `backend/.env`: đặt `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Frontend và backend phải trỏ về cùng project. Backend chỉ đọc `.env`, không đọc `.env.local`.
2. `frontend/.env.local`: đặt `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BACKEND_URL=http://127.0.0.1:8000`. Không đưa service-role key vào frontend.
3. Database cần các migration `001`–`005` phù hợp với trạng thái hiện có; bổ sung `006_doctor_invitation_issuance.sql` để cấp mã mời. Không chạy lại bootstrap hay migration đã áp dụng.
4. Backend tạo user bằng Admin API với `email_confirm: true` theo yêu cầu bỏ bước xác nhận email. Không cần cấu hình SMTP, email redirect hoặc thay đổi thiết lập xác nhận email toàn project cho luồng đăng ký này. Không đưa thao tác Admin vào browser.

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

Điền tên, email, điện thoại và mật khẩu tại `/patient/register`. API tạo Auth user có thể dùng ngay và hồ sơ liên kết. Giao diện tự đăng nhập và chuyển về app; nếu kết nối đăng nhập thất bại, người dùng có thể vào `/patient/login` bằng tài khoản vừa tạo. Sau đăng nhập, `/api/auth/me` trả hồ sơ thật; app dùng hồ sơ đó khi đặt lịch. Database lấy tên/điện thoại từ hồ sơ đã xác thực, không tin dữ liệu giả mạo trong booking body.

## Doctor và mã mời

Quản trị viên cần có hồ sơ `doctors` đã kiểm tra thông tin/chứng chỉ, đang active và chưa gắn tài khoản. Từ `backend/`, cấp mã mời bằng quyền backend:

```powershell
.\.venv\Scripts\python.exe scripts/issue_doctor_invite.py --doctor-id <UUID-ho-so-bac-si> --email doctor@example.com
```

Mã ngẫu nhiên chỉ in một lần, mặc định hết hạn sau 72 giờ; có thể dùng `--hours` từ 1 đến 720. Database chỉ lưu hash SHA-256. Cấp lại sẽ làm hết hạn mã chưa dùng trước đó của bác sĩ. Công cụ từ chối hồ sơ inactive/đã liên kết hoặc email đã có tài khoản. Chuyển mã riêng cho đúng bác sĩ; không commit mã thật hoặc ghi vào tài liệu công khai.

Tại `/doctor/register`, bác sĩ nhập đúng email được mời, mã mời, mật khẩu và chọn ít nhất một khoảng làm việc trong tuần. API liên kết hồ sơ, lưu lịch tuần, sinh slot và đánh dấu mã đã dùng trong cùng giao dịch. Không yêu cầu nhập lại hồ sơ/chứng chỉ. Giao diện tự đăng nhập và mở dashboard; có thể đăng nhập lại tại `/doctor/login` mà không cần xác nhận email. Lịch tuần, lịch hẹn và thông báo dùng cùng tài khoản.

## Hành vi lỗi

- 401: thiếu token hoặc phiên không hợp lệ; yêu cầu đăng nhập lại.
- 403: sai vai trò, thiếu hồ sơ liên kết, hoặc mã mời sai email/hết hạn/đã dùng. Không tự tạo quyền Doctor cho tài khoản.
- 409: email/hồ sơ đã đăng ký, slot bị chiếm hoặc lịch thay đổi xung đột.
- 422: dữ liệu hoặc các khoảng lịch không hợp lệ; không phản hồi lại mật khẩu/mã mời trong lỗi validation.
- 503: Auth/database chưa sẵn sàng. Nếu kết quả RPC chưa xác định, cần đối soát Auth UID; không tự retry đăng ký hoặc xóa tài khoản có thể đã commit.

## Xác minh ngày 2026-11-05

- Backend: 38 kiểm thử qua; Ruff qua.
- Frontend: 70 kiểm thử qua; ESLint, TypeScript và production build qua.
- SQL `tests/006_doctor_invitation_issuance.sql`: qua trên Supabase, dữ liệu test rollback. Kiểm tra quyền backend-only, email chuẩn hóa, cấp lại mã, thời hạn và bác sĩ inactive.
- Tích hợp thật qua Next.js `/api` proxy → FastAPI → Supabase: đăng ký Patient/Doctor và đăng nhập ngay không xác nhận email; sai mật khẩu; tài khoản trùng; mã mời sai và rollback Auth user; mã dùng lại; phân quyền; lịch tuần; đặt lịch `confirmed`; đặt trùng 409; snapshot hồ sơ Patient; dashboard/thông báo; sửa lịch; refresh token và logout.
- Script tích hợp không gửi thư và không gọi Admin API cập nhật xác nhận email giữa đăng ký và đăng nhập. Chưa kiểm tra thao tác trên trình duyệt: công cụ Computer Use dừng vì không xác định chắc URL trình duyệt Windows.
- Migration `006` đã được áp dụng trên project Supabase đang cấu hình. Sau kiểm thử đã dọn hồ sơ/tài khoản/lịch hẹn giả và file mật khẩu tạm; giữ nguyên 12 bác sĩ, 47 slot và 8 lịch hẹn ban đầu.

Script `backend/scripts/verify_auth_integration.py --doctor-id <UUID-test>` chạy kiểm tra tích hợp khi cả hai server đang mở. Chỉ dùng hồ sơ thử riêng có tên bắt đầu bằng `Auth Integration `; script từ chối hồ sơ thực hành khác. Script ghi trạng thái/tài khoản giả vào `backend/.auth-integration-state.json` đã được gitignore để đối soát, kiểm tra trình duyệt và dọn sau. Dữ liệu thử cần được quản trị DB xóa theo đúng Doctor ID, sau đó xóa các Auth UID do script tạo; không chạy script như test CI thường xuyên trên database đang phục vụ người dùng.
