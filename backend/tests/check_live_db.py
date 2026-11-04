"""Script kiểm thử toàn diện Database Supabase (Schema v2):
- Liệt kê tất cả các cột trong từng bảng (4 bảng, 29 cột)
- Kiểm thử THÊM dữ liệu lịch hẹn (INSERT qua RPC `create_appointment`)
- Kiểm thử ĐỌC & ĐỐI CHIẾU dữ liệu vừa lưu (SELECT)
- Kiểm thử CHẶN ĐẶT TRÙNG trên cùng slot (`PT409`) & CHẶN DỮ LIỆU SAI (`22023`)
- Kiểm thử CẬP NHẬT / HỦY trạng thái (`update_appointment_status`) & Tạo/Xóa Auth User
- Kiểm thử BẢO MẬT PHÂN QUYỀN DB (chặn xóa/ghi trực tiếp trái phép ngoài RPC)

Cách chạy:
    ./backend/.venv/bin/python backend/tests/check_live_db.py
"""
from __future__ import annotations

import os
from pathlib import Path
import sys
import uuid

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env", override=True)

EXPECTED_SCHEMA_V2: dict[str, list[str]] = {
    "doctors": [
        "id",
        "name",
        "specialty",
        "bio",
        "address",
        "district",
        "certificates",
        "rating",
        "rating_count",
        "active",
        "created_at",
        "updated_at",
    ],
    "appointment_slots": [
        "id",
        "doctor_id",
        "start_at",
        "end_at",
        "is_published",
    ],
    "appointments": [
        "id",
        "slot_id",
        "patient_name",
        "patient_phone",
        "notes",
        "status",
        "booking_reference",
        "created_at",
        "updated_at",
    ],
    "staff_members": [
        "user_id",
        "doctor_id",
        "created_at",
    ],
}


def run_v2_db_tests() -> int:
    url = os.getenv("SUPABASE_URL", "").strip()
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

    print("=" * 78)
    print("KIỂM THỬ DATABASE SUPABASE (SCHEMA V2 — THÊM, ĐỌC, CẬP NHẬT, XÓA & BẢO MẬT)")
    print("=" * 78)

    if not url or not key:
        print("[FAIL] Thiếu SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong backend/.env")
        return 1

    from supabase import create_client

    sb = create_client(url, key)
    passed = 0
    failed = 0

    def record(ok: bool, msg: str) -> None:
        nonlocal passed, failed
        if ok:
            passed += 1
            print(f"  [PASS] {msg}")
        else:
            failed += 1
            print(f"  [FAIL] {msg}")

    # =========================================================================
    # 1. KIỂM TRA CẤU TRÚC 4 BẢNG & LIỆT KÊ TẤT CẢ 29 CỘT
    # =========================================================================
    print("\n1. KIỂM TRA 4 BẢNG NGHIỆP VỤ & LIỆT KÊ TẤT CẢ CÁC CỘT (29 CỘT)")
    print("-" * 78)

    for table_name, expected_cols in EXPECTED_SCHEMA_V2.items():
        try:
            res = sb.table(table_name).select("*").limit(3).execute()
            rows = res.data or []
            print(f"\n* Bảng `{table_name}` ({len(expected_cols)} cột chuẩn | số bản ghi đọc mẫu: {len(rows)}):")
            for idx, col in enumerate(expected_cols, start=1):
                sample_val = rows[0].get(col) if rows else "<chưa có bản ghi mẫu>"
                print(f"    {idx:2d}. {col:<20} | Mẫu: {repr(sample_val)[:60]}")
            if rows:
                actual_cols = list(rows[0].keys())
                missing = [c for c in expected_cols if c not in actual_cols]
                extra = [c for c in actual_cols if c not in expected_cols]
                record(
                    not missing and not extra,
                    f"Bảng `{table_name}` khớp 100% danh sách {len(expected_cols)} cột Schema v2",
                )
            else:
                # Thử select tường minh tất cả các cột để chứng minh cột tồn tại dù bảng trống
                sb.table(table_name).select(",".join(expected_cols)).limit(1).execute()
                record(True, f"Bảng `{table_name}` tồn tại đủ {len(expected_cols)} cột Schema v2 (hiện có 0 dòng)")
        except Exception as exc:
            record(False, f"Lỗi kiểm tra bảng `{table_name}`: {exc}")

    # =========================================================================
    # 2. KIỂM THỬ THÊM DỮ LIỆU (INSERT LỊCH HẸN QUA RPC `create_appointment`)
    # =========================================================================
    print("\n2. KIỂM THỬ THÊM DỮ LIỆU MỚI (INSERT QUA RPC `create_appointment`)")
    print("-" * 78)

    all_slots = sb.table("appointment_slots").select("*").eq("is_published", True).order("start_at").execute().data or []
    active_appts = sb.table("appointments").select("slot_id,status").neq("status", "cancelled").execute().data or []
    occupied_slot_ids = {a["slot_id"] for a in active_appts}
    free_slots = [s for s in all_slots if s["id"] not in occupied_slot_ids]

    created_appt_id: str | None = None
    used_slot_id: str | None = None

    if not free_slots:
        record(False, "Không còn slot trống nào trong `appointment_slots` để test INSERT")
    else:
        target_slot = free_slots[0]
        used_slot_id = target_slot["id"]
        print(f"  [INFO] Sử dụng slot trống: id={used_slot_id}, start_at={target_slot['start_at']}")

        try:
            rpc_res = sb.rpc(
                "create_appointment",
                {
                    "p_slot_id": used_slot_id,
                    "p_patient_name": "  Trần Thị Kiểm Thử V2  ",
                    "p_patient_phone": "+84 (91) 234-5678",
                    "p_notes": "Kiểm thử thêm dữ liệu vào DB v2",
                },
            ).execute()
            row_out = (rpc_res.data or [None])[0]
            created_appt_id = row_out["appointment_id"] if row_out else None
            booking_ref = row_out["booking_reference"] if row_out else None
            record(
                bool(created_appt_id and booking_ref and len(booking_ref) == 12),
                f"THÊM lịch hẹn thành công: appointment_id={created_appt_id}, booking_reference={booking_ref}",
            )
        except Exception as exc:
            record(False, f"THÊM lịch hẹn qua RPC thất bại: {exc}")

    # =========================================================================
    # 3. KIỂM THỬ ĐỌC & ĐỐI CHIẾU DỮ LIỆU VỪA LƯU (SELECT & VERIFY)
    # =========================================================================
    print("\n3. KIỂM THỬ ĐỌC & ĐỐI CHIẾU BẢN GHI VỪA THÊM TRONG BẢNG `appointments`")
    print("-" * 78)

    if created_appt_id:
        stored_rows = sb.table("appointments").select("*").eq("id", created_appt_id).execute().data or []
        if stored_rows:
            stored = stored_rows[0]
            record(
                stored["patient_name"] == "Trần Thị Kiểm Thử V2"
                and stored["patient_phone"] == "+84 (91) 234-5678"
                and stored["status"] == "requested",
                f"Dữ liệu lưu bền vững, đã trim tên & gán đúng status mặc định 'requested': {stored}",
            )
        else:
            record(False, "Không tìm thấy bản ghi vừa thêm trong bảng `appointments`")

    # =========================================================================
    # 4. KIỂM THỬ CHẶN ĐẶT TRÙNG (`PT409`) & CHẶN DỮ LIỆU SAI (`22023`)
    # =========================================================================
    print("\n4. KIỂM THỬ CHẶN ĐẶT TRÙNG SLOT (`PT409`) & CHẶN DỮ LIỆU BẨN (`22023`)")
    print("-" * 78)

    if used_slot_id:
        try:
            sb.rpc(
                "create_appointment",
                {
                    "p_slot_id": used_slot_id,
                    "p_patient_name": "Người Đặt Trùng",
                    "p_patient_phone": "0988777666",
                    "p_notes": "",
                },
            ).execute()
            record(False, "Đặt trùng vào cùng 1 slot lẽ ra phải bị chặn nhưng lại thành công!")
        except Exception as exc:
            code = getattr(exc, "code", None)
            record(
                code == "PT409",
                f"Chặn đặt trùng slot thành công với mã lỗi chuẩn v2 `PT409` ({getattr(exc, 'message', exc)})",
            )

        # Kiểm thử truyền dữ liệu sai (SĐT thiếu chữ số ASCII / tên quá ngắn)
        try:
            sb.rpc(
                "create_appointment",
                {
                    "p_slot_id": used_slot_id,
                    "p_patient_name": "A",
                    "p_patient_phone": "12345",
                    "p_notes": "",
                },
            ).execute()
            record(False, "Dữ liệu không hợp lệ lẽ ra phải bị RPC chặn!")
        except Exception as exc:
            code = getattr(exc, "code", None)
            record(
                code == "22023",
                f"RPC chặn dữ liệu đầu vào sai với mã lỗi chuẩn `22023` ({getattr(exc, 'message', exc)})",
            )

    # =========================================================================
    # 5. KIỂM THỬ THÊM & XÓA USER AUTH + CẬP NHẬT TRẠNG THÁI (`update_appointment_status`)
    # =========================================================================
    print("\n5. KIỂM THỬ THÊM/XÓA AUTH USER & PHÂN QUYỀN RPC `update_appointment_status`")
    print("-" * 78)

    temp_user_id: str | None = None
    try:
        temp_email = f"qa.temp.{uuid.uuid4().hex[:8]}@7scrum.local"
        created_user = sb.auth.admin.create_user(
            {
                "email": temp_email,
                "password": "TempPassword123!",
                "email_confirm": True,
            }
        )
        temp_user_id = created_user.user.id
        record(bool(temp_user_id), f"Tạo thử nghiệm Auth User thành công: id={temp_user_id} ({temp_email})")

        # Thử gọi update_appointment_status khi user chưa được cấp quyền trong staff_members -> phải trả PT403
        if created_appt_id and temp_user_id:
            try:
                sb.rpc(
                    "update_appointment_status",
                    {
                        "p_appointment_id": created_appt_id,
                        "p_user_id": temp_user_id,
                        "p_expected_status": "requested",
                        "p_status": "confirmed",
                    },
                ).execute()
                record(False, "User chưa có trong `staff_members` lẽ ra không được phép đổi trạng thái!")
            except Exception as exc:
                code = getattr(exc, "code", None)
                record(
                    code == "PT403",
                    "RPC `update_appointment_status` chặn đúng user chưa gán quyền bác sĩ với mã `PT403`",
                )
    except Exception as exc:
        record(False, f"Lỗi khi kiểm thử Auth Admin / RPC update_appointment_status: {exc}")
    finally:
        if temp_user_id:
            try:
                sb.auth.admin.delete_user(temp_user_id)
                record(True, f"XÓA (dọn dẹp) Auth User thử nghiệm thành công: id={temp_user_id}")
            except Exception as exc:
                record(False, f"Không xóa được Auth User thử nghiệm: {exc}")

    # =========================================================================
    # 6. KIỂM THỬ CẬP NHẬT TRẠNG THÁI (`confirmed`) & HỦY LỊCH (`cancelled`) ĐỂ GIẢI PHÓNG SLOT
    # =========================================================================
    print("\n6. KIỂM THỬ CHUYỂN TRẠNG THÁI (`requested` -> `confirmed` -> `cancelled`) & GIẢI PHÓNG SLOT")
    print("-" * 78)

    staff_rows = sb.table("staff_members").select("*").limit(5).execute().data or []
    if created_appt_id and staff_rows:
        authorized_user_id = staff_rows[0]["user_id"]
        try:
            # Chuyển requested -> confirmed
            conf_res = sb.rpc(
                "update_appointment_status",
                {
                    "p_appointment_id": created_appt_id,
                    "p_user_id": authorized_user_id,
                    "p_expected_status": "requested",
                    "p_status": "confirmed",
                },
            ).execute()
            record(
                bool(conf_res.data and conf_res.data[0]["status"] == "confirmed"),
                f"Chuyển trạng thái `requested` -> `confirmed` thành công bởi Staff user_id={authorized_user_id}",
            )

            # Chuyển confirmed -> cancelled (Hủy lịch test để giải phóng lại slot trống)
            canc_res = sb.rpc(
                "update_appointment_status",
                {
                    "p_appointment_id": created_appt_id,
                    "p_user_id": authorized_user_id,
                    "p_expected_status": "confirmed",
                    "p_status": "cancelled",
                },
            ).execute()
            record(
                bool(canc_res.data and canc_res.data[0]["status"] == "cancelled"),
                f"Hủy lịch test (`confirmed` -> `cancelled`) thành công, đã giải phóng lại slot {used_slot_id}",
            )
        except Exception as exc:
            record(False, f"Lỗi khi chuyển trạng thái với Staff hợp lệ: {exc}")

    # =========================================================================
    # 7. KIỂM THỬ BẢO MẬT QUYỀN GHI/XÓA TRỰC TIẾP TRÊN BẢNG (RLS & REVOKE)
    # =========================================================================
    print("\n7. KIỂM THỬ CHẶN XÓA / SỬA TRỰC TIẾP BẢNG NGHIỆP VỤ NGOÀI RPC (DATA INTEGRITY)")
    print("-" * 78)

    # Theo 001_init.sql v2: Không cho phép DELETE trực tiếp lịch hẹn hay bác sĩ qua PostgREST
    if created_appt_id:
        try:
            sb.table("appointments").delete().eq("id", created_appt_id).execute()
            record(False, "Bảng `appointments` lẽ ra phải chặn DELETE trực tiếp để bảo toàn lịch sử!")
        except Exception as exc:
            record(
                True,
                f"DB chặn DELETE trực tiếp trên `appointments` đúng thiết kế v2 ({getattr(exc, 'message', exc)})",
            )

    try:
        sb.table("doctors").delete().eq("id", "10000000-0000-4000-8000-000000000001").execute()
        record(False, "Bảng `doctors` lẽ ra phải chặn DELETE trực tiếp!")
    except Exception as exc:
        record(
            True,
            f"DB chặn DELETE trực tiếp trên `doctors` đúng thiết kế v2 ({getattr(exc, 'message', exc)})",
        )

    print("\n" + "=" * 78)
    print(f"TỔNG KẾT KIỂM THỬ DATABASE V2: {passed} PASS / {failed} FAIL")
    print("=" * 78)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(run_v2_db_tests())
