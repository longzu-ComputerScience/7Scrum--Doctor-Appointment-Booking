"""Two-turn specialty navigation with backend-controlled replies."""

import unicodedata

from starlette.concurrency import run_in_threadpool

from app.assistant import URGENT, conservative_filters, try_ai_filters
from app.schemas import ConsultationResponse
from app.service import ALIASES, _normalize, search_doctors

SPECIALTIES = {**ALIASES, **{_normalize(name): name for name in ALIASES.values()}}


async def consult(messages: list[str]) -> ConsultationResponse:
    # Check the full patient history before asking a question or calling another service.
    history = " ".join(messages)
    message = unicodedata.normalize("NFC", " ".join(history.split()))
    if URGENT.search(message):
        return ConsultationResponse(
            reply="Hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất.",
            urgent=True,
            mode="emergency",
        )

    if len(messages) == 1:
        return ConsultationResponse(
            reply="Triệu chứng này bắt đầu từ khi nào? Bạn có thể bổ sung thời gian hoặc mức độ khó chịu.",
            followUpRequired=True,
            mode="follow-up",
        )

    filters = conservative_filters(message)
    specialty = filters["specialty"]
    used_ai = False
    if specialty is None:
        ai_filters = await try_ai_filters(message)
        if ai_filters and ai_filters["specialty"]:
            specialty = SPECIALTIES.get(_normalize(ai_filters["specialty"]))
            used_ai = specialty is not None
    if specialty is None:
        return ConsultationResponse(
            reply="Chưa đủ thông tin để gợi ý chuyên khoa. Bạn có thể bắt đầu lại và mô tả rõ hơn triệu chứng.",
            mode="rule-based",
        )

    # Only the verified specialty and a district recognized from patient input reach the catalog.
    search = await run_in_threadpool(search_doctors, specialty=specialty, district=filters["district"])
    demo_mode = search["demoMode"]
    # The shared catalog accepts partial matches for free-text search.
    normalized_specialty = _normalize(specialty)
    doctors = [] if demo_mode else [
        doctor for doctor in search["doctors"] if _normalize(doctor["specialty"]) == normalized_specialty
    ]
    reply = f"Bạn có thể tham khảo chuyên khoa {specialty}. Đây không phải chẩn đoán y khoa."
    if demo_mode:
        reply += " Danh mục bác sĩ thật chưa được cấu hình trong môi trường này."
    elif not doctors:
        reply += " Chưa có bác sĩ phù hợp trong danh mục."
    return ConsultationResponse(
        reply=reply,
        specialty=specialty,
        doctors=doctors,
        demoMode=demo_mode,
        usedAI=used_ai,
        mode="ai-assisted" if used_ai else "rule-based",
    )
