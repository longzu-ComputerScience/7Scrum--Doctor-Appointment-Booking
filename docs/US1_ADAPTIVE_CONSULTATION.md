# US-01 adaptive consultation (optional AI)

The public `POST /api/consult` contract is unchanged: send 1–4 **patient-authored** strings, and render the response using `followUpRequired`, `urgent`, `specialty`, `mode` and `usedAI`. The frontend already preserves prior successful patient messages. No database migration is required.

## Configuration (backend only)

- `CONSULTATION_AI_PROVIDER=auto` (default): prefer OpenAI when `OPENAI_API_KEY` exists; otherwise Gemini when `GEMINI_API_KEY` exists; otherwise deterministic fallback.
- `CONSULTATION_AI_PROVIDER=openai`: use `OPENAI_API_KEY` and optional `OPENAI_MODEL` (default `gpt-4.1-mini`).
- `CONSULTATION_AI_PROVIDER=gemini`: use `GEMINI_API_KEY` and optional `GEMINI_MODEL` (default `gemini-2.5-flash`).
- `CONSULTATION_AI_PROVIDER=none`: disable external AI and preserve rule-based navigation.

Never put provider API keys in `NEXT_PUBLIC_*` variables or frontend code. Deploy keys only to the Render backend environment. The existing `/api/assistant` endpoint continues to use its previous OpenAI filter extraction and is outside this PR.

## Behavior and boundaries

1. Before any AI request or catalog lookup, the backend checks all patient-authored messages for the existing emergency phrases; it never routes a matched emergency to normal booking.
2. With a provider configured, the LLM returns a structured decision: `ask_follow_up` (one short contextual question) or `recommend_specialty` (one label on the backend allowlist). Invalid JSON, disallowed labels, errors and timeouts fail closed to deterministic fallback. An AI decision is guidance, not a clinical assessment.
3. No provider or a failed provider: first turn asks a contextual follow-up; an unresolved concern gets one further distinct follow-up. The rule-based path stops after at most three patient messages (two follow-up questions), while AI requests remain bounded by the existing four-message input contract.
4. Without a safe specialty after those questions, it returns no specialty and offers catalog browsing. With a specialty, the backend returns up to five active catalog doctors. In an environment without a database, only explicitly labeled synthetic demo doctor records are returned, and sample booking confirmation stays disabled. No doctors are invented from AI output.

## Local checks

```bash
cd backend
python -m pytest tests/test_adaptive_consultation.py tests/test_po_mvp.py -q
python -m ruff check app/consult.py app/consultation_ai.py tests/test_adaptive_consultation.py
```

These tests mock provider decisions. Before production: test both real provider responses on staging, inspect privacy/compliance requirements for transmitting symptom text to the chosen provider, verify routing on local Supabase, and manually test urgent, partial, complete and ambiguous messages. The keyword emergency guard is not comprehensive medical triage.
