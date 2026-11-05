"""US-01 adaptive consultation: no external AI or database required."""
import asyncio

import pytest
from fastapi.testclient import TestClient

from app import consultation_ai, main
from app.consultation_ai import Decision
from app import consult as consultation

client = TestClient(main.app)


@pytest.fixture(autouse=True)
def no_provider(monkeypatch):
    for key in ("OPENAI_API_KEY", "GEMINI_API_KEY", "CONSULTATION_AI_PROVIDER"):
        monkeypatch.delenv(key, raising=False)


def test_existing_rash_flow_still_works():
    first = client.post("/api/consult", json={"messages": ["Tôi bị nổi mẩn đỏ"]}).json()
    assert first["followUpRequired"] is True
    assert first["specialty"] is None
    second = client.post("/api/consult", json={"messages": ["Tôi bị nổi mẩn đỏ", "Khoảng hai ngày nay"]}).json()
    assert second["followUpRequired"] is False
    assert second["specialty"] == "Da liễu"
    assert second["usedAI"] is False
    assert second["demoMode"] is True
    assert len(second["doctors"]) == 1
    assert second["doctors"][0]["id"] == "10000000-0000-4000-8000-000000000001"
    assert "(Demo)" in second["doctors"][0]["name"]


def test_unknown_symptom_asks_exactly_two_followups_then_stops():
    messages = ["Tôi không khỏe", "Tôi thấy khó chịu", "Cũng chưa rõ"]
    first = client.post("/api/consult", json={"messages": messages[:1]}).json()
    second = client.post("/api/consult", json={"messages": messages[:2]}).json()
    assert first["followUpRequired"] is True
    assert second["followUpRequired"] is True
    assert first["reply"] != second["reply"]
    result = client.post("/api/consult", json={"messages": messages}).json()
    assert result["followUpRequired"] is False
    assert result["specialty"] is None
    assert result["doctors"] == []


def test_ai_recommends_on_first_turn(monkeypatch):
    async def ai(messages, allowed):
        assert "Da liễu" in allowed
        return Decision(action="recommend_specialty", specialty="Da liễu", question=None)
    monkeypatch.setattr(consultation, "decide", ai)
    result = client.post("/api/consult", json={"messages": ["Tôi nổi mẩn hai ngày nay"]}).json()
    assert result["specialty"] == "Da liễu"
    assert result["usedAI"] is True
    assert result["followUpRequired"] is False


def test_ai_asks_specific_question(monkeypatch):
    async def ai(messages, allowed):
        return Decision(action="ask_follow_up", question="Vị trí đau ở đâu?", specialty=None)
    monkeypatch.setattr(consultation, "decide", ai)
    result = client.post("/api/consult", json={"messages": ["Tôi bị đau"]}).json()
    assert result["followUpRequired"] is True
    assert result["reply"] == "Vị trí đau ở đâu?"
    assert result["usedAI"] is True


def test_ai_question_at_limit_does_not_extend_conversation(monkeypatch):
    async def ai(messages, allowed):
        return Decision(action="ask_follow_up", question="Bạn đau ở đâu?", specialty=None)
    monkeypatch.setattr(consultation, "decide", ai)
    result = client.post("/api/consult", json={"messages": ["Tôi bị đau"] * 4}).json()
    assert result["followUpRequired"] is False
    assert result["specialty"] is None


def test_urgent_history_preempts_ai_and_catalog(monkeypatch):
    async def ai(messages, allowed):
        pytest.fail("AI must not run for urgent symptoms")
    monkeypatch.setattr(consultation, "decide", ai)
    result = client.post("/api/consult", json={
        "messages": ["Tôi bị nổi mẩn", "Tôi bị đau ngực dữ dội"]
    }).json()
    assert result["urgent"] is True
    assert result["doctors"] == []


def test_ai_provider_missing_key_returns_none():
    assert asyncio.run(consultation_ai.decide(["Tôi bị đau"], {"Da liễu"})) is None


def test_ai_output_is_strictly_validated():
    allowed = {"Da liễu"}
    valid = {"action": "recommend_specialty", "question": None, "specialty": "Da liễu"}
    assert consultation_ai._validate(valid, allowed).specialty == "Da liễu"
    for payload in (
        {**valid, "specialty": "Chuyên khoa không tồn tại"},
        {**valid, "extra": "untrusted"},
        {"action": "ask_follow_up", "question": "", "specialty": None},
        {"action": "ask_follow_up", "question": "Hỏi thêm?", "specialty": "Da liễu"},
    ):
        with pytest.raises(ValueError):
            consultation_ai._validate(payload, allowed)


def test_provider_http_failure_falls_back(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-not-a-real-key")
    async def broken(messages, allowed):
        raise ValueError("invalid model output")
    monkeypatch.setattr(consultation_ai, "_openai", broken)
    assert asyncio.run(consultation_ai.decide(["Tôi bị đau"], {"Da liễu"})) is None



def test_gemini_key_failure_uses_scripted_fallback_and_demo_catalog(monkeypatch):
    monkeypatch.setenv("CONSULTATION_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "invalid-test-key")

    async def unavailable(_messages, _allowed):
        raise ValueError("Gemini unavailable")

    monkeypatch.setattr(consultation_ai, "_gemini", unavailable)
    first = client.post("/api/consult", json={"messages": ["Tôi bị đau đầu"]})
    assert first.status_code == 200
    assert first.json()["followUpRequired"] is True
    second = client.post("/api/consult", json={
        "messages": ["Tôi bị đau đầu", "Khoảng hai ngày nay"],
    })
    assert second.status_code == 200
    data = second.json()
    assert data["usedAI"] is False
    assert data["mode"] == "rule-based"
    assert data["specialty"] == "Nội tổng quát"
    assert data["demoMode"] is True
    assert len(data["doctors"]) == 1
    assert "(Demo)" in data["doctors"][0]["name"]


def test_fallback_matches_real_catalog_when_database_available(monkeypatch):
    doctor = {
        "id": "10000000-0000-4000-8000-000000000099",
        "name": "Dr. Real Example",
        "specialty": "Da liễu", "bio": "Skin care",
        "address": "Clinic A", "district": "Thủ Đức",
        "certificates": [], "rating": None, "ratingCount": 0,
    }
    calls = []
    def catalog(*, specialty, district):
        calls.append((specialty, district))
        return {"demoMode": False, "doctors": [doctor]}

    monkeypatch.setattr(consultation, "search_doctors", catalog)
    data = client.post("/api/consult", json={
        "messages": ["Tôi bị nổi mẩn tại Thủ Đức", "Khoảng hai ngày nay"],
    }).json()
    assert data["specialty"] == "Da liễu"
    assert data["demoMode"] is False
    assert data["doctors"] == [doctor]
    assert calls == [("Da liễu", "Thủ Đức")]


def test_fallback_urgent_never_recommends_sample_doctors(monkeypatch):
    monkeypatch.setenv("CONSULTATION_AI_PROVIDER", "none")
    data = client.post("/api/consult", json={
        "messages": ["Tôi nổi mẩn", "Tôi bị khó thở nghiêm trọng"],
    }).json()
    assert data["urgent"] is True
    assert data["specialty"] is None
    assert data["doctors"] == []
