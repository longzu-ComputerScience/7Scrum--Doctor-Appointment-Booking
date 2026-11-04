# Two-Day Sprint — Dependency-Based Plan

**PO source:** SMART HOSPITAL PATIENT APPOINTMENT SYSTEM, section 7. This schedule is a sequencing guide, **not** a fixed hourly assignment. Goal: one end-to-end patient-to-clinic demo.

## Day 1 — Build Core Features

**First half:** confirm Next.js + FastAPI + Supabase approach; check shared API contract and sample data; implement staff schedule input (US-03) and booking UI (US-02) first because availability is a dependency.

**Second half:** implement controlled chatbot and specialty mapping (US-01); wire doctor matching to clinic-created availability; integrate booking persistence and confirmation (US-02). Begin vertical-slice testing immediately.

**Expected outcome:** each major module can run locally; core integration is underway. Avoid postponing staff-created availability to Day 2.

## Day 2 — Integrate, Verify, Demo

**First half:** finish US-01 → US-02 → US-03 data flow. Confirm availability synchronization and slot becoming unavailable after booking. Refresh staff confirmed appointments list.

**Second half:** fix critical defects; verify US AC01–AC06 for each of the three stories; run the six-step Dermatology acceptance scenario and Sprint Review with PO.

**Expected outcome:** one working flow with shared persistent data and documented PO decision.

## Role handoff

- **Tech Lead:** backend FastAPI, Supabase schema/contracts, booking concurrency, merge/integration and optional preview deploy.
- **UI 1:** chatbot/follow-up/doctor discovery (US-01 and part of US-02).
- **UI 2:** slot booking and clinic schedule-input UI (US-02 and US-03).
- **BA 1:** PO scope/AC and acceptance review; **BA 2:** synthetic data/demo script.
- **Tester:** API negative paths, cross-interface availability checks and six-step E2E; reports defects.

Every work item follows docs/DEFINITION_OF_DONE.md. Prioritize functionality ahead of visual extras and optional infrastructure.
