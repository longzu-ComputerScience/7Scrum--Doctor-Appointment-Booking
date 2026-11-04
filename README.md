# 7Scrum — Doctor Appointment Booking

48-hour scheduling MVP with **Next.js frontend**, **FastAPI backend** and **Supabase PostgreSQL/Auth**. The PO approved **3 must-have User Stories (US-01/02/03)**; production deployment is optional.

> **PRD mới:** [Doctor recurring schedule — Update requirements](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i). Mục tiêu: Patient/Doctor Auth, Doctor lịch tuần định kỳ và tự sinh slot 30 phút, Patient đặt lịch **201 confirmed** (không cần Doctor xác nhận), Doctor notifications/upcoming/effective-date schedule changes. Contract: [API_CONTRACT_V2.md](docs/API_CONTRACT_V2.md); database target: [DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md); tình trạng code thật: [DOCS_GUIDE.md](docs/DOCS_GUIDE.md). **Main có PR #27–#30 và #38–#40 đã merge nhưng chưa đủ PRD mới.**

## Repository structure

- `frontend/` — Next.js 16 + TypeScript. Patient booking UI PR #27, Doctor List PR #30, legacy Staff page còn tồn tại; phải bổ sung Patient/Doctor Auth, weekly editor, Doctor Dashboard/notifications. Next.js proxy `/api/*` tới FastAPI.
- `backend/` — FastAPI + Python 3.12. Doctor auth mapping và endpoints đã merge #39/#40; cần recurring schedule API, Patient JWT booking auto-confirm, generated availability và notifications theo Contract mới.
- `supabase/` — PostgreSQL schema/migrations. `schema_v2.sql`/001 là **legacy bootstrap**, 003 staff và 004 doctor_accounts/manual-slot RPC; weekly schedules/notifications cần **migration mới**, không sửa lại SQL đã áp dụng.
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

**Kiểm tra DB thật trước khi làm gì:** các migration `001–004` là trạng thái lịch sử, `schema_v2.sql` chỉ bootstrap DB trống và chưa có weekly hours/notifications. **Không chạy lại hoặc sửa đè migrations đã apply, không chạy schema_v2 trên DB có dữ liệu**. BE1 #31 phải audit/backup, tạo migration *additive* mới và phối hợp BE2 #32 ở RPC/booking status. Chỉ xác nhận V2 đã chạy sau DB inspection/test. `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` chỉ nằm trong **backend/.env**, không commit.

Configure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` **only** in frontend for Patient/Doctor authentication. The service role key is always backend-only.

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

Live Supabase double-booking, Doctor/Patient Auth, recurring schedule and notifications require real integration testing; Vercel deployment remains optional.

## Deploy on Vercel

Create **two Vercel projects from the same GitHub repository**:

1. FastAPI project: Root Directory `backend`; framework FastAPI (auto-detected from `index.py` / requirements). Add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, optional `OPENAI_API_KEY`, `CORS_ORIGINS`.
2. Next.js project: Root Directory `frontend`; set `BACKEND_URL=https://<backend-domain>` (do not add `/api`), plus the frontend's public Supabase settings. Deploy the backend before building the frontend.

No deployment is performed by the repository refactor itself.

## Team workflow

Sáu issue chính: **#31 BE1, #32 BE2, #33 FE1, #34 FE2, #35 Tester, #36 Lead** (gồm việc US-02 còn thiếu và US-03 mới). Đọc `docs/DOCS_GUIDE.md`, `docs/USER_STORIES.md`, `docs/API_CONTRACT_V2.md`, `docs/DATA_DICTIONARY.md`, `docs/TEAM_WORKFLOW.md`, `docs/DEFINITION_OF_DONE.md`. `docs/API_CONTRACT.md` là legacy. PR cần review và test; không commit keys hoặc dữ liệu bệnh nhân thật.

## PO-approved scope (2026-11-04)

**US-01:** chatbot follow-up/specialty. **US-02:** Patient đăng nhập, chọn Doctor và auto-derived 30-minute slot, booking atomic `confirmed`, double-book 409, popup đúng. **US-03:** Doctor invitation-register/chọn weekly working hours, dashboard sửa lịch theo effectiveDate (block conflicts), notifications/upcoming/status `confirmed/completed/cancelled`. Không clinic staff manual slot.

**Important:** Target API ở `docs/API_CONTRACT_V2.md` **chưa triển khai hết**. `schema_v2.sql` là bootstrap lịch sử; migration mới phải bổ sung recurring schedule, roles, booking+notification. Không coi merged PR/CI là PO sign-off.

## Issue execution order

See [Current execution order](docs/EXECUTION_ORDER.md) and [6-role issue mapping](docs/ISSUE_MAPPING.md).
