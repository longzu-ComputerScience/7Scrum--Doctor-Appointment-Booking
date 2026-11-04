"""Limited two-turn specialty navigation demo. No diagnosis or persistent chat history."""
from __future__ import annotations

from app.assistant import URGENT, conservative_filters, search_from_message


async def consult(messages: list[str]) -> dict:
    # The client sends only user-authored messages (bounded by Pydantic).
    message = " ".join(messages).strip()
    if URGENT.search(message):
        return {
            "reply": "Nếu có dấu hiệu nguy hiểm, hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất.",
            "followUpRequired": False, "specialty": None, "doctors": [], "urgent": True,
            "demoMode": False, "usedAI": False, "mode": "controlled-prototype",
        }

    # PO requires at least one basic follow-up for supported consultation.
    if len(messages) == 1:
        return {
            "reply": "Triệu chứng này bắt đầu từ khi nào? Bạn có thể bổ sung thời gian hoặc mức độ khó chịu.",
            "followUpRequired": True, "specialty": None, "doctors": [], "urgent": False,
            "demoMode": False, "usedAI": False, "mode": "controlled-prototype",
        }

    # Controlled fallback understands a limited set of skin-rash/skin-care/general scenarios.
    filters = conservative_filters(message)
    if not filters["specialty"]:
        filters["specialty"] = "Nội tổng quát"
    # Use existing AI-filter + catalog path when a model key is supplied.
    search = await search_from_message(message)
    if not search["doctors"]:
        from starlette.concurrency import run_in_threadpool
        from app.service import search_doctors
        search = {
            **(await run_in_threadpool(search_doctors, specialty=filters["specialty"])),
            "usedAI": False, "urgent": False,
        }
    specialty = filters["specialty"]
    if search["doctors"]:
        specialty = search["doctors"][0]["specialty"]
    return {
        "reply": f"Bạn có thể tham khảo chuyên khoa {specialty}. Đây không phải chẩn đoán y khoa.",
        "followUpRequired": False,
        "specialty": specialty, "doctors": search["doctors"],
        "urgent": False, "demoMode": search["demoMode"],
        "usedAI": search["usedAI"], "mode": "controlled-prototype",
    }
