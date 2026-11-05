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


def test_unknown_symptom_continues_until_limit():
    messages = ["Tôi không khỏe", "Tôi thấy khó chịu", "Cũng chưa rõ"]
    for n in (1, 2, 3):
        result = client.post("/api/consult", json={"messages": messages[:n]}).json()
        assert result["followUpRequired"] is True
        assert result["specialty"] is None
    result = client.post("/api/consult", json={"messages": messages + ["Tôi không biết"]}).json()
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
