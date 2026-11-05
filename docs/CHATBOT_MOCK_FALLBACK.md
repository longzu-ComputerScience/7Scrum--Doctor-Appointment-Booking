# Chatbot scripted fallback and doctor booking handoff

## Scope

When the configured OpenAI/Gemini provider is unavailable (no key, invalid response, HTTP failure, or timeout), the FastAPI consultation endpoint uses deterministic rules. No new Supabase schema, storage, RLS or environment changes are required.

## Demo flow

1. Open Carely chatbot and type **Tôi bị nổi mẩn đỏ**.
2. The assistant asks a relevant follow-up question. Select **Khoảng 2 ngày** or type your answer.
3. The assistant suggests Dermatology (Da liễu) and displays up to five doctor cards from the existing backend catalog.
4. Click **Choose a time** on a real doctor. The app opens the existing doctor booking page, which fetches available 30-minute slots from the server. A signed-in Patient selects a slot and confirms in the existing booking form. No chat message creates an appointment.
5. If Supabase is not configured, the doctor card is explicitly marked **Demo** and the CTA is **Preview sample schedule**. The booking page shows sample time slots but disables confirmation.

Other demos: **Tôi không khỏe** leads to two distinct follow-ups; if still ambiguous, the chatbot offers browsing the catalog rather than inventing a specialty. **Tôi bị đau ngực dữ dội** triggers urgent guidance with no routine booking links.

## Real vs synthetic data

- With a configured database, every suggested doctor comes from the active public catalog. Do not fabricate doctor IDs, appointment slots, ratings, or booking references.
- With databaseConfigured=false, the existing synthetic profiles in backend/app/demo.py are returned. They have demonstrative names and the UI clearly states they are not real doctors.
- Actual available time slots, patient authentication, and appointment confirmation are owned by the existing booking screen and backend, never by the chatbot.
- If the backend itself is unreachable, the chatbot reports an error. It does not pretend the AI is connected or that an appointment was saved.

## Safety and privacy

- The deterministic path is a specialty-navigation helper, not clinical diagnosis or emergency clearance.
- The urgent keyword guard runs before any AI request or catalog recommendation.
- With no reliable specialty after two follow-up questions, it stops asking and recommends consulting qualified medical staff.
- The UI only accepts doctor records with valid UUIDs and catalog fields. Emergency/incomplete recommendations must not provide booking actions.
- No conversation or patient details are persisted as part of this feature.

## Local tests

- Backend: in backend folder, run python -m pytest -q tests/test_adaptive_consultation.py tests/test_po_mvp.py, then ruff check app tests.
- Frontend: in frontend folder, run npm test, npm run lint, npx tsc --noEmit, npm run build.
- For full E2E, deploy matching frontend and FastAPI branch builds before verifying the doctor cards and slot calendar in Preview.

## Configuration

- CONSULTATION_AI_PROVIDER=none forces scripted mode.
- CONSULTATION_AI_PROVIDER=auto prefers a configured provider; if absent or failing it uses scripted fallback.
- Neither AI credentials nor new Supabase settings are required to test the mock doctor cards.

Important: the fallback is available when **AI** is down, not when the entire FastAPI backend is unavailable.