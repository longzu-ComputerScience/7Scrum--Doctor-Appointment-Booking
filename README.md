# 7Scrum — Doctor Appointment Booking

48-hour scheduling MVP with **Next.js frontend**, **FastAPI backend** and **Supabase PostgreSQL/Auth**. The PO approved **3 must-have User Stories (US-01/02/03)**; production deployment is optional.

## Repository structure

- `frontend/` — Next.js 16 + TypeScript. UI, Supabase Auth login for clinic staff, and an API reverse proxy. **No business/API Route Handlers**.
- `backend/` — FastAPI + Python 3.12. Controlled chatbot follow-up, doctor search, clinic-created availability, atomic confirmed booking via PostgreSQL RPC, clinic-staff authorization.
- `supabase/` — PostgreSQL schema and fictional seed catalog.
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

For real booking, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in **backend/.env**, apply `supabase/migrations/001_init.sql`, then `supabase/migrations/002_po_mvp_schedule.sql`, then `supabase/seed.sql` through Supabase SQL Editor. Create a staff user in Supabase Auth and insert its ID into `staff_members` as described in the seed file.

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

One issue per branch/PR. Before work, read `docs/USER_STORIES.md`, `docs/DEFINITION_OF_DONE.md`, `docs/TEAM_WORKFLOW.md`, `docs/API_CONTRACT.md` and GitHub issues. Release readiness and human/PO sign-off are tracked in `docs/RELEASE_CHECKLIST.md`. Never commit API keys or actual patient information. The assistant is a scheduling/search aid, **not a diagnostic service**.

## PO-approved scope (2026-11-04)

**US-01:** symptom chatbot with basic follow-up and specialty suggestion. **US-02:** doctor selection, persistent confirmed booking, double-booking prevention. **US-03:** staff creates slots and sees confirmed patient appointments. Full PO requirements and two-day plan: `docs/USER_STORIES.md`, `docs/SPRINT_PLAN.md`, `docs/ISSUE_MAPPING.md`, `docs/ACCEPTANCE_SCENARIO.md`.

**Important:** Apply both SQL migrations in order. Migration 002 makes bookings immediately confirmed for the demo and protects overlapping slots. The optional controlled chatbot prototype is not a medical diagnosis system.

## Bat dau theo thu tu issue

Xem **[Thu tu trien khai 2 ngay](docs/EXECUTION_ORDER.md)** de biet issue nao can lam ngay, phu thuoc vao issue nao va viec FE/BE/QA co the thuc hien song song.
