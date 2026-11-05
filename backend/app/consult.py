"""Bounded, context-aware specialty navigation with backend-owned safety checks."""

import re
import unicodedata

from starlette.concurrency import run_in_threadpool

from app.assistant import URGENT, conservative_filters
from app.consultation_ai import decide
from app.schemas import ConsultationResponse
from app.service import ALIASES, _normalize, search_doctors

SPECIALTIES = {**ALIASES, **{_normalize(name): name for name in ALIASES.values()}}
ALLOWED = set(SPECIALTIES.values())
MAX_MESSAGES = 4
DURATION = re.compile(
    r"\b(?:\d+\s*(?:ngày|tuần|tháng|năm|giờ|day|days|week|weeks|month|months|hour|hours)|"
    r"hôm qua|hôm nay|sáng nay|tối qua|yesterday|today|last night)\b",
    re.IGNORECASE,
)


def fallback_question(message: str, specialty: str | None) -> str:
    if specialty and not DURATION.search(message):
        return "Triệu chứng này bắt đầu từ khi nào?"
    if specialty:
        return "Triệu chứng có diễn biến hoặc mức độ như thế nào?"
    return "Bạn có thể mô tả rõ hơn triệu chứng chính và vị trí xuất hiện không?"


async def consult(messages: list[str]) -> ConsultationResponse:
    history = " ".join(messages)
    message = unicodedata.normalize("NFC", " ".join(history.split()))

    # Safety takes precedence over model output, follow-ups and catalog access.
    if URGENT.search(message):
        return ConsultationResponse(
            reply="Hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất.",
            urgent=True,
            mode="emergency",
        )

    filters = conservative_filters(message)
    specialty = filters["specialty"]
    ai = await decide(messages, ALLOWED)
    used_ai = ai is not None
    if ai is not None:
        if ai.action == "recommend_specialty":
            specialty = ai.specialty
        elif len(messages) < MAX_MESSAGES:
            return ConsultationResponse(
                reply=ai.question or fallback_question(message, specialty),
                followUpRequired=True,
                usedAI=True,
                mode="follow-up",
            )
        else:
            # At the conversation limit do not treat a model question as a recommendation.
            specialty = None
    elif len(messages) == 1:
        # No provider: keep legacy two-turn behavior, but ask a contextual question.
        return ConsultationResponse(
            reply=fallback_question(message, specialty),
            followUpRequired=True,
            mode="follow-up",
        )
    elif specialty is None and len(messages) < MAX_MESSAGES:
        return ConsultationResponse(
            reply=fallback_question(message, specialty),
            followUpRequired=True,
            mode="follow-up",
        )

    if specialty is None:
        return ConsultationResponse(
            reply="Chưa đủ thông tin để gợi ý chuyên khoa một cách đáng tin cậy. "
                  "Vui lòng liên hệ cơ sở y tế để được hướng dẫn hoặc bắt đầu cuộc trò chuyện mới.",
            usedAI=used_ai,
            mode="ai-assisted" if used_ai else "rule-based",
        )

    # Model cannot supply doctor IDs or arbitrary specialties; catalog is authoritative.
    search = await run_in_threadpool(search_doctors, specialty=specialty, district=filters["district"])
    demo_mode = search["demoMode"]
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
