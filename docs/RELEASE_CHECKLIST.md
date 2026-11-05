# Release checklist — Doctor recurring weekly workflow

**Status:** NOT VERIFIED / NOT PO ACCEPTED. [PRD updated](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?tab=t.e6mixvt2az0i) · [API Contract](API_CONTRACT_V2.md) · [Data Dictionary](DATA_DICTIONARY.md) · [E2E scenario](ACCEPTANCE_SCENARIO.md).

| Gate | Bằng chứng bắt buộc | Trạng thái |
| --- | --- | --- |
| 6 issue #31–#36 và contract cùng phiên bản | PRs, review, SHA, `API_CONTRACT_V2.md` | Pending |
| Patient và Doctor Auth/registration | Auth+profile/invite mapping, JWT/403 | Pending |
| Doctor weekly setup/updates | DB weekly intervals, version/effectiveDate, conflict 409 | Pending |
| Auto-derived 30-minute availability | Không manual slot publish; empty/occupied/cancel/UTC+7 | Pending |
| Booking confirmed trong DB | POST 201 `confirmed`+reference, 1×201/1×409 race | Pending |
| Notification persistent/realtime | Appointment+notification atomic, Doctor upcoming, unread, reconnect | Pending |
| US-01 integrated | Follow-up, specialty, urgent/fallback, Doctor List | Pending |
| Quality | Current FE/BE CI + live Supabase integration tests | Pending |
| Human review & PO decision | Named reviewer, demo, feedback | Pending |

## Handover

- Main SHA/PRs merged, source PRD revision:
- Supabase project and **actual** applied migration (without secrets):
- Patient/Doctor synthetic accounts; appointment/slot/notification IDs:
- Schedule conflict/booking race HTTP & DB evidence:
- Realtime/reconnect target ~5s observation:
- CI run + named reviewer:
- Unresolved blockers and owner:
- PO acceptance date/feedback:

**Legacy `schema_v2.sql` & `001–004` do not equal completed new PRD migration.** Không đánh dấu Complete nếu chưa chạy thực tế.
