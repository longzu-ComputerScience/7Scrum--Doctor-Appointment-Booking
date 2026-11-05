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
3. No provider: first turn asks a contextual follow-up, a recognized specialty can be returned from subsequent turns, and unrecognized symptoms can receive additional questions until the four-message limit.
4. On the fourth patient message, the assistant must stop asking; when insufficient evidence remains, it returns no specialty. No doctors are invented; catalog query and active-doctor filtering remain backend-controlled.

## Local checks

```bash
cd backend
python -m pytest tests/test_adaptive_consultation.py tests/test_po_mvp.py -q
python -m ruff check app/consult.py app/consultation_ai.py tests/test_adaptive_consultation.py
```

These tests mock provider decisions. Before production: test both real provider responses on staging, inspect privacy/compliance requirements for transmitting symptom text to the chosen provider, verify routing on local Supabase, and manually test urgent, partial, complete and ambiguous messages. The keyword emergency guard is not comprehensive medical triage.
