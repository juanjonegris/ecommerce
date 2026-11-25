# Changelog — plan-slice-epic

## 2.0.0 — 2026-11-24

- Adapted to the white-label e-commerce monorepo and to GitHub Issues.
- **Naming:** "tickets" are now **stories**. The output is `.agents/epics/<slug>/stories.md`, with ids `S1, S2…`,
  matching the story workflow that runs each one.
- **New Step 7, create on GitHub:** after the stories are agreed and the creation is confirmed, it creates the
  epic as a parent issue and each story as a sub-issue (`issue_write` with `parent_issue_number`). Then it writes
  `GH-<n>` back into the file and adds `Blocked by: #<n>` lines. Re-runs never duplicate an issue. Rule 1 now
  allows GitHub writes only in this step.
- **Story shape:** an **Issue** part (title `<Area> / <Outcome>`, labels, a body with User story, Context,
  Acceptance criteria, Dev Notes or SPIKE deliverable, Deployment notes) and a **Planning only** part (GitHub
  number, Covers, Areas, Data, Wave, Blocked by). The `### Acceptance criteria` heading is what `/story-spec`
  pre-fills from.
- **Tests:** stories now follow `CLAUDE.md` "Done means": unit tests on `test/factories/` and Playwright specs.
  The last acceptance bullet is "`/story-validate GH-<n>` passes".
- **References:**
  - `references/ecommerce-slicing.md` replaces the previous workspace conventions: GitHub conventions, story
    workflow and branch names, slicing across `apps/api` + `@repo/types` + `apps/web`, where details go.
  - The example is now `references/example-stories.md` (`back-in-stock-alerts`).

## 1.x

- Earlier versions were written for another workspace and tracker. Their structure (vertical slices, spikes as
  Wave 1 stories, waves and a dependency graph, AC coverage, the closing self-check, stable IDs on re-runs) is
  kept.
