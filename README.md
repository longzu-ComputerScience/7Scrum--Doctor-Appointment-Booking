# 7Scrum — Doctor Appointment Booking

48-hour scheduling MVP with **Next.js frontend**, **FastAPI backend** and **Supabase PostgreSQL/Auth**. The PO approved **3 must-have User Stories (US-01/02/03)**; production deployment is optional.

> **V1 runtime vs V2 target:** The technical target is [API_CONTRACT_V2.md](docs/API_CONTRACT_V2.md), [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) and [schema_v2.sql](supabase/schema_v2.sql). Product authority is [PO SMART HOSPITAL, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8). Current code / the live DB may still be partially V1; see [DOCS_GUIDE.md](docs/DOCS_GUIDE.md) for version boundaries and open PO decisions. **V2 booking begins as `requested`, not immediately `confirmed`.**

## Repository structure

- `frontend/` — Next.js 16 + TypeScript. UI, Supabase Auth login for clinic staff, and an API reverse proxy. **No business/API Route Handlers**.
- `backend/` — FastAPI + Python 3.12. Controlled chatbot follow-up, doctor search, staff scheduling and atomic booking. **Existing V1 implementation may differ from the V2 target** (doctor-scoped staff access; initial booking status `requested`).
- `supabase/` — PostgreSQL schema/migrations and fictional seed catalog; `schema_v2.sql` is a **fresh-DB bootstrap only**, not an in-place V1 upgrade.
- `docs/` — API contract, user stories, team workflow, Definition of Done and release evidence.
- `.github/workflows/ci.yml` — independent Node and Python checks.

## Local setup

### 1. Backend

```powershell
cd backend
Copy-Item .env.example .env
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
uvicorn index:app --reload --port 8000
```

Use `source .venv/bin/activate` on macOS/Linux. Backend is available at `http://127.0.0.1:8000/api/health` and API docs at `/docs`.

### 2. Frontend (second terminal)

```powershell
cd frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Visit `http://localhost:3000`. Next.js proxies `/api/*` to FastAPI using the server-side `BACKEND_URL` variable, default `http://127.0.0.1:8000`. UI fetch calls are unchanged.

### 3. Supabase

**Choose one DB path after inspecting the actual environment:** (a) **Legacy V1 runtime:** `supabase/migrations/001_init.sql` → `002_po_mvp_schedule.sql` → compatible V1 seed; these are **not V2 migrations**. (b) **New empty Supabase V2 test project:** `supabase/schema_v2.sql` then an appropriate V2 synthetic seed and a test staff user's doctor-scoped membership. (c) **Existing V1 Supabase project migrating to V2:** follow the audit/backup/data-preserving migration plan in `docs/DATA_DICTIONARY.md` §9; **do not run `schema_v2.sql` or DROP clinic/room on a populated V1 DB**. Check API/code compatibility before changing schema. Store `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` only in **backend/.env**; never commit or share values.

Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` **only** in frontend for staff authentication. The service role key is always backend-only.

If Supabase is not configured, the doctor catalog and slot previews use fictional demo data and booking responds with HTTP 503 (never a fake success). An optional `OPENAI_API_KEY` in the backend enables AI-assisted doctor search; keyword fallback works without it.

## Tests

```powershell
cd frontend
npm run lint
npx tsc --noEmit
npm run build

cd ../backend
python -m pytest -q
python -m ruff check .
```

Live Supabase double-booking, staff Auth, Vercel deployment and OpenAI calls require real credentials and dedicated integration testing before release.

## Deploy on Vercel

Create **two Vercel projects from the same GitHub repository**:

1. FastAPI project: Root Directory `backend`; framework FastAPI (auto-detected from `index.py` / requirements). Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `OPENAI_API_KEY`, `CORS_ORIGINS`.
2. Next.js project: Root Directory `frontend`; set `BACKEND_URL=https://<backend-domain>` (do not add `/api`), plus the frontend's public Supabase settings. Deploy the backend before building the frontend.

No deployment is performed by the repository refactor itself.

## Team workflow

One issue per branch/PR. Before work, read `docs/DOCS_GUIDE.md`, `docs/USER_STORIES.md`, `docs/DEFINITION_OF_DONE.md`, `docs/TEAM_WORKFLOW.md`, `docs/API_CONTRACT_V2.md`, `docs/DATA_DICTIONARY.md`, and the active `[TODAY-US2]`/`[TODAY-US3]` issues. The older `docs/API_CONTRACT.md` is **V1 historical reference only**. Release readiness and human/PO sign-off are tracked in `docs/RELEASE_CHECKLIST.md`. Never commit API keys or actual patient information. The assistant is a scheduling/search aid, **not a diagnostic service**.

## PO-approved scope (2026-11-04)

**US-01:** symptom chatbot with basic follow-up and specialty suggestion. **US-02:** doctor selection, persisted booking request and double-booking prevention (**V2 status `requested`; not falsely confirmed**). **US-03:** authorized clinic staff creates doctor slots, confirms requests and views confirmed appointments; the PO tab role and status acceptance still need Lead/PO resolution. Full PO requirements and plan: `docs/DOCS_GUIDE.md`, `docs/USER_STORIES.md`, `docs/SPRINT_PLAN.md`, `docs/ISSUE_MAPPING.md`, `docs/ACCEPTANCE_SCENARIO.md`.

**Important:** `001_init.sql` → `002_po_mvp_schedule.sql` is the **legacy V1** path, not the V2 schema. `schema_v2.sql` only runs on an **empty Supabase DB**; existing V1 data require a separate migration. Do not claim V2 readiness or live acceptance from merged PRs/CI alone. The optional controlled chatbot prototype is not a medical diagnosis system.

## Issue execution order

See **[Two-day execution order (Vietnamese)](docs/EXECUTION_ORDER.md)** for immediate tasks, prerequisites, and work that FE/BE/QA can do in parallel.
