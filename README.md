# 7Scrum — Doctor Appointment Booking

A 48-hour MVP for doctor discovery and appointment booking, built with **Next.js (TypeScript)**, **Supabase**, and **Vercel**.

## Core workflow
1. Search using a natural-language request (AI-assisted if a server-side API key is configured) or browse doctors.
2. Receive verified doctor + clinic cards from the database, never invented AI names.
3. Select a doctor and see their available time slots.
4. Submit a booking. A PostgreSQL RPC enforces atomic slot reservation.
5. Authenticated clinic staff view appointments and advance their status.

**Safety:** This is a scheduling tool, not a medical diagnosis service. Use synthetic patient and doctor data for the demo.

## Quick start
\`\`\`bash
npm install
cp .env.example .env.local
npm run dev
\`\`\`
On PowerShell: \`Copy-Item .env.example .env.local\`.

- Configure \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_SUPABASE_ANON_KEY\`, \`SUPABASE_SERVICE_ROLE_KEY\` using a Supabase project.
- Apply \`supabase/migrations/001_init.sql\` then \`supabase/seed.sql\` in the Supabase SQL editor.
- Optionally set \`OPENAI_API_KEY\` to enable tool-calling search. Without it, keyword search remains available.
- For staff access, create a Supabase Auth user and insert its auth user ID into \`staff_members\` with the clinic ID.
- Deploy to Vercel and set the same environment variables in project settings. **Never place the service-role key or OpenAI key in NEXT_PUBLIC variables.**

Without database credentials, the public catalog shows labeled **demo data**, but **bookings are disabled** rather than silently faked.

## Development
\`\`\`bash
npm run lint
npx tsc --noEmit
npm run build
\`\`\`
See [API Contract](docs/API_CONTRACT.md), [Team Workflow](docs/TEAM_WORKFLOW.md), and GitHub Issues. Open feature branches + PRs; avoid pushing features directly to main.

## Team ownership
| Role | Scope |
|---|---|
| Tech Lead | Architecture, Supabase, AI endpoint, API, integration |
| UI 1 | Patient search + recommendation cards |
| UI 2 | Booking + staff dashboard |
| BA 1 | User journeys, scope, acceptance criteria |
| BA 2 | Data specification, seed dataset, demo story |
| QA | Test plan, API/UI regression, bug triage |

## MVP non-goals
Medical diagnosis, complex triage, multi-agent orchestration, EHR integration, external calendar sync, payment, and real clinic deployment.
