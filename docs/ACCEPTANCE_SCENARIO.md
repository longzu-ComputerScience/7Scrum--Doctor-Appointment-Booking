# PO final acceptance — Dermatology appointment (US-01/02/03)

**Product authority:** [PO SMART HOSPITAL, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8), section 9. **Technical target:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql). **Status: NOT YET VERIFIED.** See [DOCS_GUIDE.md](DOCS_GUIDE.md) for the unresolved immediate-confirmation versus `requested` discrepancy.

Use only fictional data. Record the tested commit, API version, live Supabase schema and migration/seed evidence before running. `schema_v2.sql` bootstraps **a new empty Supabase DB only**; an existing V1 database needs an audited migration, **not** schema_v2 run over it. Patient and staff must share the same database.

| Step | Actor | Action | Required evidence |
| --- | --- | --- | --- |
| 1 | Authorized clinic staff | Select an **assigned doctor** (Dermatology); create a future published slot | Slot persisted, non-overlapping, returned to US-02 after refresh |
| 2 | Patient | Enter a supported skin-rash scenario in the chatbot | At least one follow-up; Dermatology suggested; no diagnosis; urgent path tested separately |
| 3 | Patient | Continue to doctor discovery | A real active dermatologist and truly available, future slot appear |
| 4 | Patient | Submit valid name/phone and chosen slot | Atomic appointment persisted; HTTP 201 and booking reference; **V2 status is `requested`, displayed as pending**, not `confirmed` |
| 5 | Patient / QA | Refresh availability and retry an occupied slot | Pending and confirmed bookings both occupy the slot; refresh excludes it; duplicate request returns 409 |
| 6 | Staff | Refresh appointments; confirm pending request if the V2 flow is approved | Staff sees correct patient/doctor/date/time, can transition `requested → confirmed`; only then does UI show **confirmed** |

**PO sign-off blocker:** The linked PO tab uses immediate booking "confirmation" and final "confirmed appointment", while V2 starts at `requested`; another Google Doc Requirements tab explicitly specifies pending. Obtain Lead/PO approval of the two-step scenario or an approved contract change **before** calling this final acceptance complete. Likewise confirm whether the user is clinic staff authorized for assigned doctors or a doctor self-managing schedules (different PO tabs). Staff schedule endpoints/DB write authorization must be implemented securely; their presence in V1 docs does not prove V2 readiness.

## Evidence / sign-off

- Demo date, tested commit and environment:
- Actual Supabase schema, migration and seed:
- API contract version / staff authorization:
- Patient and staff screenshots, HTTP results, booking persistence:
- 401/403/409/422/503, double-book race and timezone tests:
- AI-assisted code human reviewer and CI run:
- Critical blockers and PO clarification (actor + status):
- Product Owner decision and feedback:

Do not mark accepted from documentation, mocks or CI alone. Production deployment is not a PO requirement.
