# Product backlog — Updated Doctor workflow (MVP)

**Nguồn chuẩn:** [Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i) sửa đổi [PRD nền](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.qnrlozg520mq). Đọc [DOCS_GUIDE.md](DOCS_GUIDE.md), [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md). Chỉ theo dõi việc hiện tại tại #31–#36; các issue US-02 cũ là lịch sử.

## US-AUTH — Patient / Doctor accounts (P0)

- Patient tự đăng ký/đăng nhập; `patient_profiles` liên kết Supabase Auth; booking đòi JWT và prefill thông tin. Không lưu mật khẩu trong bảng ứng dụng.
- Doctor đăng ký qua **invitation gắn với doctor profile đã tồn tại**, đăng nhập riêng, chọn **weekly working schedule ngay lúc đăng ký**. Token Doctor → chính doctor_id của mình; không xem/sửa Doctor khác.
- Auth & profile phải persist. Doctor registration không tạo hồ sơ bác sĩ bất kỳ.

## US-01 — AI symptom consultation (P0)

- Chatbot nhận triệu chứng, hỏi câu bổ sung trong kịch bản hỗ trợ, gợi ý **specialty** (không chẩn đoán).
- Nhận diện dấu hiệu khẩn cấp định nghĩa trước; hiển thị hướng dẫn hỗ trợ y tế, không điều hướng booking thường.
- AI timeout/lỗi có fallback rõ; specialty điều hướng **doctor catalog thật** và không bịa doctor/slot.
- US-01 vẫn bắt buộc trong demo, dù không còn issue riêng; Lead #36 chịu trách nhiệm điều phối tích hợp.

## US-02 — Doctor selection, calendar & instant booking (P0)

- Danh sách chỉ doctor active; lọc specialty; doctor detail thể hiện name/specialty/address/district, certificates/rating nếu có.
- Patient đã login xem calendar tự tính từ Doctor recurring weekly schedule: giờ tương lai, mỗi slot **30 phút**, không hiện slot đã có appointment chưa hủy. Múi giờ Việt Nam; realtime + reconnect/refetch.
- Booking được backend revalidate và lưu **atomically** với notification, **201 `confirmed`** + reference, popup thành công/thất bại đúng dữ liệu. Slot bị chiếm ngay, hai request đồng thời chỉ một thành công, không fake success.
- Patient booking vẫn tận dụng FE2 modal và `slotId` (slot do hệ thống sinh, không do Doctor tạo tay) theo [API V2](API_CONTRACT_V2.md); chỉ sửa những điểm không tương thích.

## US-03 — Doctor recurring schedule & dashboard (P0)

- Doctor chọn ngày và **nhiều khoảng giờ/weekday** lúc đăng ký; validate >=30 phút và bội số 30 phút, không overlap.
- System tự sinh slot **30 phút** từ weekly working hours; Doctor **không** cần tạo/publish từng slot.
- Doctor có thể thay lịch theo **effectiveDate tương lai**; giữ nguyên confirmed appointments; nếu thay đổi đụng appointment `confirmed` thì trả danh sách conflicts, **không lưu schedule mới** đến khi xử lý.
- Doctor Dashboard: profile, weekly schedule, auto-derived calendar, danh sách appointments của chính mình, upcoming future `confirmed` tăng dần; status `confirmed → completed/cancelled`, hai terminal không đổi nữa.
- Booking thành công sinh **persistent in-app notification** cho đúng Doctor, có màn Notifications, unread/mark-read, cập nhật realtime; không có notification khi booking thất bại.

## Quy tắc chung / out of scope

- Dữ liệu bền vững trên cùng DB; tách Patient/Doctor quyền, JWT xác thực tại BE; không có clinic staff admin trong scope mới.
- Không `requested`, `checked_in` cho booking mới. Không thêm manual slot publishing, payment, patient self-cancel/reschedule, SMS/email, EMR, production deployment.
- NFR: availability/notifications đồng bộ khi có event (mục tiêu ~5 giây điều kiện bình thường); tính đúng, atomic transaction và auth ưu tiên hơn realtime UI.
- AC/DoD cần bằng chứng Auth, conflict update, concurrency, refresh/reconnect, pending migration data, 401/403/409/422/503; không tuyên bố hoàn thành khi chưa kiểm chứng [final scenario](ACCEPTANCE_SCENARIO.md).
