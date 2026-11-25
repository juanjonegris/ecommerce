# Changelog — plan-create-prd

## 2.0.0 — 2026-11-24

- Adapted to the white-label e-commerce repo.
- **Output and header:**
  - Output moved to `.agents/epics/<slug>/prd.md`, next to the platform PRD `.agents/PRD.md`.
  - The header field `repos` is now `areas` (`api`, `web`, `types`, `infra`).
- **Interview:**
  - Step 1 reads `.agents/PRD.md` (scope, users, white-label strategy) as context.
  - Phase 3 offers the platform's user types and asks about languages (`es`, `en`) and fork scope.
  - Migration mode now means replacing an existing flow, or a store or tool a client runs elsewhere. The
    "Legacy parity" section is now "Parity".
- **Rules:** a GitHub issue can be the input (read only). Rule 8 is "never write to GitHub". The personal-data
  examples are now customer data.
- **Example:** rewritten as `back-in-stock-alerts`, the example chain shared with `plan-architecture` and
  `plan-slice-epic`.

## 1.x

- Earlier versions were written for another workspace and tracker. Their history (interview phases, the
  "Ready to write?" gate, the six-point self-check, the shared `mode` values, the user-story job sentence) is kept in
  the structure above.
