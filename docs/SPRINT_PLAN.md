# Two-Day Sprint — Dependency-Based Plan

**Product source:** [SMART HOSPITAL PATIENT APPOINTMENT SYSTEM, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8), section 7. This is a dependency sequence, not an hourly commitment. **V2 target:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql). See [DOCS_GUIDE.md](DOCS_GUIDE.md) for V1 migration and outstanding PO decisions.

## Day 1 — Build Core Features

**First half:** confirm Next.js + FastAPI + Supabase approach; check shared API contract and sample data; implement staff schedule input (US-03) and booking UI (US-02) first because availability is a dependency.

**Second half:** integrate controlled chatbot/specialty mapping (US-01), doctor matching and persisted booking (US-02). **V2 initially saves `requested`** and blocks the slot; only a real staff transition can mark `confirmed`. Begin vertical-slice testing immediately.

**Expected outcome:** each major module can run locally; core integration is underway. Avoid postponing staff-created availability to Day 2.

## Day 2 — Integrate, Verify, Demo

**First half:** finish US-01 → US-02 → US-03 flow on the same verified DB; test staff-created slots, availability synchronization and occupied `requested` slots. Verify staff can confirm a request and then see it in the confirmed list, subject to Lead/PO approval.

**Second half:** fix critical defects; verify US AC01–AC06 for each of the three stories; run the six-step Dermatology acceptance scenario and Sprint Review with PO.

**Expected outcome:** one working flow with shared persistent data and documented PO decision.

## Role handoff

- **BE1 #3 → #31:** database audit, V2 migration/constraints, staff memberships and booking RPC.
- **BE2 #26 → #32:** doctor/booking and doctor-scoped staff APIs; supplement missing staff schedule contract with Lead.
- **FE1 #5 → #33:** doctor discovery handoff and staff appointment view.
- **FE2 #7 (closed/merged) → #34:** patient booking integration and staff schedule input.
- **Tester #9 → #35:** authorization, negative cases, concurrency and cross-interface six-step E2E.
- **Lead #25 → #36:** source precedence, PO scope and unresolved decisions, PR integration, demo and sign-off. Current six-person team has **no BA-assigned issues**.

Every work item follows docs/DEFINITION_OF_DONE.md. Prioritize functionality ahead of visual extras and optional infrastructure.
