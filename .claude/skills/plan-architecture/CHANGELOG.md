# Changelog — plan-architecture

## 2.0.0 — 2026-11-24

- Adapted to the white-label e-commerce monorepo.
- **Output:** the default location is now `.agents/epics/<slug>/`, next to the PRD. The header field `repos` is now
  `areas`.
- **Inputs:**
  - Step 1 reads `CLAUDE.md`, `.claude/rules/**`, `apps/web/CLAUDE.md` and `.agents/PRD.md`.
  - A GitHub issue can be the input (read only). Rule 6 is "never write to GitHub".
- **Exploration:** brownfield work uses the `Explore` subagent, with `products/` and `payments/` as the reference
  modules.
- **New Step 3 topic, Provider ports:** a port, a stub adapter, and an env key that defaults to `''`.
- **References:**
  - `references/ecommerce-brownfield.md` replaces the previous workspace checklist: areas touched, data and
    storage, provider ports and config, fork impact, fixed rules, testing approach, `es`/`en`.
  - The example now follows `back-in-stock-alerts`.
- **Next steps:** `plan-slice-epic`; or a single GitHub issue → `/story-spec GH-<n>`; or a spike on a
  `GH-<n>-<slug>` branch.

## 1.x

- Earlier versions were written for another workspace and tracker. Their structure (propose-then-ask, the
  "Ready to write?" gate, spikes with a decision rule and a deliverable, the shared YAML header and `mode` values)
  is kept.
