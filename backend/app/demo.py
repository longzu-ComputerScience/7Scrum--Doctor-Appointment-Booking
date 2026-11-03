"""Synthetic demonstration data; not real healthcare providers."""
from datetime import datetime, timedelta, time, timezone
from uuid import UUID
from zoneinfo import ZoneInfo

DEMO_DOCTORS = [
    {
        "id": "10000000-0000-4000-8000-000000000001",
        "name": "BS. Nguyễn Minh An (Demo)",
        "specialty": "Da liễu",
        "bio": "Khám và tư vấn các vấn đề về da.",
        "clinicId": "20000000-0000-4000-8000-000000000001",
        "clinicName": "Phòng khám Mẫu A",
        "clinicAddress": "Thủ Đức, TP.HCM (địa chỉ minh họa)",
        "district": "Thủ Đức",
    },
    {
        "id": "10000000-0000-4000-8000-000000000002",
        "name": "BS. Trần Hoàng Mai (Demo)",
        "specialty": "Tim mạch",
        "bio": "Tư vấn và thăm khám các vấn đề tim mạch.",
        "clinicId": "20000000-0000-4000-8000-000000000002",
        "clinicName": "Phòng khám Mẫu B",
        "clinicAddress": "Bình Thạnh, TP.HCM (địa chỉ minh họa)",
        "district": "Bình Thạnh",
    },
    {
        "id": "10000000-0000-4000-8000-000000000003",
        "name": "BS. Lê Quốc Bình (Demo)",
        "specialty": "Nội tổng quát",
        "bio": "Khám sức khỏe tổng quát.",
        "clinicId": "20000000-0000-4000-8000-000000000001",
        "clinicName": "Phòng khám Mẫu A",
        "clinicAddress": "Thủ Đức, TP.HCM (địa chỉ minh họa)",
        "district": "Thủ Đức",
    },
]


def demo_slots(doctor_id: UUID) -> list[dict]:
    doctor = next((d for d in DEMO_DOCTORS if d["id"] == str(doctor_id)), None)
    if not doctor:
        return []
    zone = ZoneInfo("Asia/Ho_Chi_Minh")
    today = datetime.now(zone).date()
    slots = []
    for offset in (1, 2, 3):
        for hour in (9, 10, 14):
            start = datetime.combine(today + timedelta(days=offset), time(hour), zone)
            slots.append(
                {
                    "id": f"30000000-0000-4000-8000-{offset * 100 + hour:012d}",
                    "doctorId": doctor["id"],
                    "clinicId": doctor["clinicId"],
                    "startAt": start.astimezone(timezone.utc).isoformat(),
                    "endAt": (start + timedelta(minutes=30)).astimezone(timezone.utc).isoformat(),
                    "roomName": None,
                }
            )
    return slots
