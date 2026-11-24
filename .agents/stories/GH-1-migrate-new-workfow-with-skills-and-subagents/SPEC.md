# SPEC — Migrate new workfow with skills and subagents

> **Source:** [GH-1](https://github.com/juanjonegris/ecommerce/issues/1) — Migrate new workfow with skills and subagents

## Description

Migrate new workflow with skills and subagents.

## Problem

Make a mixture between a standard spec, design, plan, implement, validate and review flow, with priming and a strong accent on the plan document and process. Add a step for auto-improvement of the AI layer system. Generate a record of progress, and a way to resume.

## Use case

1. The developer runs `/story-spec GH-<n>`. The agent interviews them and writes `SPEC.md`.
2. The developer runs `/story-plan`. A primed architect subagent writes `PLAN.md`, and its open questions get answered.
3. The developer runs `/story-implement`. The implementer subagent writes the code and an implementation summary.
4. The validate gates (lint, typecheck, test, build) run, and their results are logged.
5. The developer runs `/story-review`. The reviewer subagent writes `REVIEW.md` with a verdict.
6. If the verdict is `fix-needed`, the developer runs `/story-fix`.
7. After an approved review, a retro step proposes edits to the AI layer.

At any point, `/story-resume` shows where the story stands.

## Acceptance criteria

- The workflow runs end to end as Claude Code skills and subagents: spec, plan, implement, validate, review, fix.
- The plan step primes the codebase, and `PLAN.md` is the central, question-driven artifact.
- Validation (lint, typecheck, test, build) runs and is recorded before a review can approve.
- After an approved story, a self-improvement step proposes edits to `CLAUDE.md`, the rules, or the workflow files.
- Progress is logged per story in `LOGS.md`, and `/story-resume` restores where the work stands.

## References

- `refs/ticket-harness-analysis-2026-11-16.md`: analysis of the imported Devin-era ticket harness: inventory, `shared/` folder check, readiness, action plan
- `refs/story-harness-adaptation-plan-2026-11-16.md`: the ticket → story adaptation plan, with recorded decisions and the remaining phases (2–4)

## Out of scope

- Packaging the workflow as a Claude Code plugin
- Writing back to GitHub (comments, labels, closing issues) without asking first
- Retiring `/planning` and `/execute`
- App code changes in `apps/` or `packages/`
