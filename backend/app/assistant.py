"""Bounded AI tool call: extract filters; database owns doctor records."""
import json
import os
import re

import httpx

from app.service import search_doctors

URGENT = re.compile(
    r"đau ngực dữ dội|khó thở (?:nghiêm trọng|dữ dội|cấp tính)|bất tỉnh|"
    r"co giật liên tục|chảy máu không cầm|severe chest pain|difficulty breathing|unconscious",
    re.IGNORECASE,
)


def conservative_filters(message: str) -> dict[str, str | None]:
    text = message.lower()
    specialty = (
        "Da liễu" if re.search(r"da liễu|mụn|nổi mẩn|dermatology", text)
        else "Tim mạch" if re.search(r"tim mạch|cardiology", text)
        else "Nội tổng quát" if re.search(r"nội tổng quát|general medicine", text)
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
    async with httpx.AsyncClient(timeout=10) as client:
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
    tool_call = next(
        (
            item for item in body.get("output", [])
            if item.get("type") == "function_call" and item.get("name") == "search_doctors"
        ),
        None,
    )
    if not tool_call:
        raise ValueError("No search_doctors function call returned")
    args = json.loads(tool_call["arguments"])
    if not isinstance(args, dict):
        raise ValueError("Invalid AI tool arguments")
    return {
        field: value.strip()[:limit] if isinstance(value := args.get(field), str) else None
        for field, limit in (("specialty", 80), ("district", 80), ("keyword", 100))
    }


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
    filters = conservative_filters(message)
    used_ai = False
    if os.getenv("OPENAI_API_KEY"):
        try:
            filters = await extract_filters_with_ai(message)
            used_ai = True
        except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError):
            # The app remains useful if provider times out or returns invalid JSON.
            pass
    # Result lookup is independent of AI: AI never gets to invent a doctor.
    from starlette.concurrency import run_in_threadpool

    result = await run_in_threadpool(search_doctors, **filters)
    return {
        **result,
        "filters": filters,
        "usedAI": used_ai,
        "urgent": False,
        "message": (
            "Đây là các bác sĩ có trong danh mục phù hợp với yêu cầu. "
            "Vui lòng kiểm tra chuyên khoa trước khi đặt lịch."
            if result["doctors"] else
            "Không có bác sĩ phù hợp. Hãy thử chuyên khoa hoặc khu vực khác."
        ),
    }
