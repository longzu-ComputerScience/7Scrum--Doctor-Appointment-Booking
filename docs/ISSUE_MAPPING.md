# PO work breakdown → active TODAY issues (2026-11-04)

**Product source:** [PO SMART HOSPITAL, tab t.0](https://docs.google.com/document/d/1Ay61Cs7Y5W_piJL4S_7fYOfK59wD9u85irrZQ38hv4s/edit?pli=1&tab=t.0#heading=h.a4pni6r8dmg8). **Technical target:** [API_CONTRACT_V2.md](API_CONTRACT_V2.md), [DATA_DICTIONARY.md](DATA_DICTIONARY.md), [schema_v2.sql](../supabase/schema_v2.sql); see [DOCS_GUIDE.md](DOCS_GUIDE.md) for unresolved differences.

The PO's DEV-01..09 tasks are **illustrative**, not extra User Stories or separate issues to reopen. The active board consists of **five `[TODAY-US2]` issues (#3, #5, #9, #25, #26) and six `[TODAY-US3]` issues (#31–#36)**. Existing FE2 US-02 #7 is closed after PR #27 merged.

| PO task / responsibility | Story | Active tracking |
| --- | --- | --- |
| DEV-01 Shared data / environment | Shared | BE1 #3 → #31; Lead #25 → #36 |
| DEV-02 Staff schedule input UI | US-03 | FE2 **#34** |
| DEV-03 Save and retrieve availability | US-03 | BE2 **#32**, DB support BE1 **#31** |
| DEV-04 Conversation UI | US-01 | Existing code; **Lead #36 must verify/assign remaining work** (no active dedicated US-01 issue) |
| DEV-05 Specialty suggestion and safety | US-01 | Existing code; **Lead #36 must verify/assign remaining work** |
| DEV-06 Doctor discovery and slots | US-02 | FE1 **#5**, BE2 **#26**; FE2 #7/PR #27 already merged |
| DEV-07 Booking and double-book prevention | US-02 | BE1 **#3**, BE2 **#26**, Tester **#9**; FE2 #7/PR #27 already merged |
| DEV-08 Staff confirmed appointments | US-03 | FE1 **#33**, BE2 **#32** |
| DEV-09 Integration, QA, demo and PO acceptance | Shared | Tester **#9** → **#35**; Lead **#25** → **#36** |

**Historical handoff:** old US-03 #21→#32, #22→#34, #8→#33, #19→#35. They are **closed as superseded, not verified complete**. Other closed BA/P1/E2E issues are historical; their necessary PO acceptance requirements remain in the active Lead/Tester release gates, not in a second active backlog.

**Dependencies:** BE1 V2 database/migration #31 ↔ BE2 doctor-scoped staff APIs #32 → FE2 #34 / FE1 #33 → Tester #35 → Lead #36 and PO review. Reuse finished US-02 pieces but **do not assume #3/#26/#5/#9 are complete** merely because a PR merged. US-01 must join the final end-to-end flow. V2 booking is initially `requested`; staff confirmation and PO sign-off are separate gates.
