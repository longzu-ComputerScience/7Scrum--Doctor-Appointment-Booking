"""Bounded AI tool call: extract filters; database owns doctor records."""
import asyncio
import json
import os
import re

import httpx
from starlette.concurrency import run_in_threadpool

from app.service import search_doctors

URGENT = re.compile(
    r"đau ngực (?:rất )?dữ dội|khó thở (?:(?:rất )?nghiêm trọng|dữ dội|cấp tính)|bất tỉnh|"
    r"co giật liên tục|chảy máu không (?:thể )?cầm|severe chest pain|difficulty breathing|unconscious",
    re.IGNORECASE,
)
FILTER_LIMITS = {"specialty": 80, "district": 80, "keyword": 100}
AI_TIMEOUT_SECONDS = 10


def conservative_filters(message: str) -> dict[str, str | None]:
    text = message.lower()
    specialty = (
        "Da liễu" if re.search(r"da liễu|mụn|nổi mẩn|ngứa da|phát ban|dermatology|skin rash", text)
        else "Tim mạch" if re.search(r"tim mạch|cardiology|đánh trống ngực|palpitations", text)
        else "Nội tổng quát" if re.search(
            r"(?:nội|khám) tổng quát|general medicine|đau đầu|nhức đầu|headache|"
            r"mệt mỏi|fatigue|cảm cúm|cảm lạnh|sốt|fever|đau bụng", text
        )
        else None
    )
    district = (
        "Thủ Đức" if re.search(r"thủ đức|thu duc", text)
        else "Bình Thạnh" if re.search(r"bình thạnh|binh thanh", text)
        else None
    )
    return {
        "specialty": specialty,
        "district": district,
        "keyword": None if specialty or district else message,
    }


async def extract_filters_with_ai(message: str) -> dict[str, str | None]:
    request_body = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        "instructions": (
            "You are a clinic booking search router. Call search_doctors once. "
            "Extract medical specialty, district, and doctor/clinic keyword, "
            "using null if unspecified. Never diagnose, fabricate doctors, "
            "assume slots are available, or create appointments. "
            "If symptoms are mentioned, cautiously map to a possible specialty. "
            "Keep Vietnamese specialty/district labels where possible."
        ),
        "input": message,
        "tools": [
            {
                "type": "function",
                "name": "search_doctors",
                "description": "Find real doctors and clinics using structured filters.",
                "strict": True,
                "parameters": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "specialty": {"type": ["string", "null"]},
                        "district": {"type": ["string", "null"]},
                        "keyword": {"type": ["string", "null"]},
                    },
                    "required": ["specialty", "district", "keyword"],
                },
            }
        ],
        "tool_choice": "required",
        "max_output_tokens": 200,
    }
    async with httpx.AsyncClient(timeout=AI_TIMEOUT_SECONDS) as client:
        response = await client.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
                "Content-Type": "application/json",
            },
            json=request_body,
        )
        response.raise_for_status()
        body = response.json()
    if not isinstance(body, dict) or body.get("status", "completed") != "completed":
        raise ValueError("Invalid AI response")
    output = body.get("output")
    if not isinstance(output, list) or not all(isinstance(item, dict) for item in output):
        raise ValueError("Invalid AI output")
    calls = [item for item in output if item.get("type") == "function_call"]
    if len(calls) != 1 or calls[0].get("name") != "search_doctors":
        raise ValueError("Expected one search_doctors function call")
    if calls[0].get("status") not in (None, "completed"):
        raise ValueError("AI tool call did not complete")
    arguments = calls[0].get("arguments")
    if not isinstance(arguments, str):
        raise ValueError("Invalid AI tool arguments")
    args = json.loads(arguments)
    if not isinstance(args, dict) or args.keys() != FILTER_LIMITS.keys():
        raise ValueError("Invalid AI tool arguments")
    filters = {}
    for field, limit in FILTER_LIMITS.items():
        value = args[field]
        if value is not None and (not isinstance(value, str) or not value.strip() or len(value.strip()) > limit):
            raise ValueError("Invalid AI filter value")
        filters[field] = value.strip() if value is not None else None
    return filters


async def try_ai_filters(message: str) -> dict[str, str | None] | None:
    if not os.getenv("OPENAI_API_KEY"):
        return None
    try:
        # HTTPX timeouts apply to individual network operations.
        async with asyncio.timeout(AI_TIMEOUT_SECONDS):
            return await extract_filters_with_ai(message)
    except (TimeoutError, httpx.HTTPError, ValueError, KeyError):
        return None


async def search_from_message(message: str) -> dict:
    # Urgent symptoms are not routed into routine booking recommendations.
    if URGENT.search(message):
        return {
            "doctors": [], "demoMode": False, "filters": {},
            "usedAI": False, "urgent": True,
            "message": (
                "Nếu bạn có triệu chứng nghiêm trọng hoặc tình trạng khẩn cấp, "
                "hãy liên hệ cấp cứu 115 hoặc đến cơ sở cấp cứu gần nhất. "
                "Hệ thống này không chẩn đoán bệnh."
            ),
        }
    ai_filters = await try_ai_filters(message)
    filters = ai_filters if ai_filters is not None else conservative_filters(message)
    # Result lookup is independent of AI: AI never gets to invent a doctor.
    result = await run_in_threadpool(search_doctors, **filters)
    return {
        **result,
        "filters": filters,
        "usedAI": ai_filters is not None,
        "urgent": False,
        "message": (
            "Đây là các bác sĩ có trong danh mục phù hợp với yêu cầu. "
            "Vui lòng kiểm tra chuyên khoa trước khi đặt lịch."
            if result["doctors"] else
            "Không có bác sĩ phù hợp. Hãy thử chuyên khoa hoặc khu vực khác."
        ),
    }
