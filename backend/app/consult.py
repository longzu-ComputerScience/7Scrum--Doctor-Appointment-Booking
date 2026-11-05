"""Specialty navigation with backend-controlled follow-up and replies."""

import re
import unicodedata

from starlette.concurrency import run_in_threadpool

from app.assistant import URGENT, conservative_filters, try_ai_filters
from app.schemas import ConsultationResponse
from app.service import ALIASES, _normalize, search_doctors

SPECIALTIES = {**ALIASES, **{_normalize(name): name for name in ALIASES.values()}}
PAIN_SYMPTOMS = re.compile(r"\b(?:nhức đầu|đau đầu|đau bụng|headache|abdominal pain|stomach ?ache|stomach pain)\b", re.I)
PAIN_ONSET = re.compile(
    r"\b(?:hôm qua|hôm nay|sáng nay|tối qua|vừa bắt đầu|"
    r"(?:\d+|một|hai|ba|vài)\s*(?:phút|giờ|ngày|tuần)|"
    r"yesterday|today|this morning|last night|(?:\d+|one|two|three|a few)\s*(?:minutes?|hours?|days?|weeks?))\b",
    re.I,
)
PAIN_LEVEL = re.compile(r"\b(?:đau nhẹ|nhẹ thôi|vừa phải|mức độ (?:nhẹ|vừa)|mild|moderate)\b", re.I)
NEGATED_PAIN_LEVEL = re.compile(r"\b(?:không (?:đau )?(?:nhẹ|vừa)|not (?:mild|moderate))\b", re.I)
SEVERE_PAIN = re.compile(r"\b(?:dữ dội|rất đau|đau nặng|severe|extremely painful|excruciating)\b", re.I)
SUDDEN_ONSET = re.compile(r"\b(?:đột ngột|bất ngờ|suddenly|sudden)\b", re.I)
PAIN_EMERGENCY_SIGNS = re.compile(r"\b(?:yếu liệt một bên|nôn ra máu|weakness on one side|vomiting blood)\b", re.I)
PAIN_FOLLOW_UP = "Cơn đau bắt đầu từ khi nào? Hiện bạn đau nhẹ, đau vừa phải hay đau dữ dội?"


async def consult(messages: list[str]) -> ConsultationResponse:
    # Check the full patient history before asking a question or calling another service.
    history = [unicodedata.normalize("NFC", " ".join(message.split())) for message in messages]
    message = " ".join(history)
    pain_reported = PAIN_SYMPTOMS.search(message) is not None
    severe_pain = pain_reported and SEVERE_PAIN.search(message) is not None
    if URGENT.search(message) or (pain_reported and PAIN_EMERGENCY_SIGNS.search(message)) or (
        severe_pain and SUDDEN_ONSET.search(message)
    ):
        return ConsultationResponse(
            reply="Hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất.",
            urgent=True,
            mode="emergency",
        )

    if severe_pain:
        return ConsultationResponse(
            reply="Bạn nên liên hệ cơ sở y tế sớm để được đánh giá trực tiếp về cơn đau dữ dội.",
            mode="rule-based",
        )

    follow_up = " ".join(history[1:])
    pain_details_complete = (
        PAIN_ONSET.search(message) and PAIN_LEVEL.search(follow_up) and not NEGATED_PAIN_LEVEL.search(follow_up)
    )
    if len(messages) == 1 or (pain_reported and not pain_details_complete and len(messages) < 4):
        return ConsultationResponse(
            reply=PAIN_FOLLOW_UP if pain_reported else (
                "Triệu chứng này bắt đầu từ khi nào? Bạn có thể bổ sung thời gian hoặc mức độ khó chịu."
            ),
            followUpRequired=True,
            mode="follow-up",
        )

    filters = conservative_filters(message)
    specialty = filters["specialty"]
    used_ai = False
    if pain_reported:
        specialty = "Nội tổng quát" if pain_details_complete else None
    elif specialty is None:
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
