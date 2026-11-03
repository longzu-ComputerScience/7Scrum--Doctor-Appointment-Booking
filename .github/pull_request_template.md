## Linked issue and story
Issue: #
User story: US-

## Summary
Describe concrete change and affected files (`frontend/`, `backend/`, `supabase/`, or `docs/`).

## Acceptance & Definition of Done
- [ ] Acceptance criteria in linked issue are met and evidenced
- [ ] Basic validation and error states checked
- [ ] Responsive desktop/mobile checked for UI changes
- [ ] No secrets or real patient data introduced
- [ ] AI-generated draft/code/test/document, if used, reviewed and **explicitly confirmed by a named Dev Team member**
- [ ] No release-blocking defects

## Verification
- [ ] Frontend: npm run lint; npx tsc --noEmit; npm run build (if affected)
- [ ] Backend: python -m ruff check .; python -m pytest -q (if affected)
- [ ] Relevant API/UI/DB test case and screenshot or logs linked
- [ ] Supabase integration / booking contention tested when relevant

**Human AI-draft reviewer (name or GitHub handle):**

**Review evidence (link/comment):**

**Known limitations / remaining QA:**

See `docs/DEFINITION_OF_DONE.md`. A green build is necessary but does not imply PO acceptance or live deployment.
