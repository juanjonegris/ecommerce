# IMPLEMENTATION SUMMARY — Migrate new workfow with skills and subagents

## Summary
Fills in the missing pieces of the story workflow:
- **Validate step:** `/story-validate` is a main-session skill. It runs steps 1–6 of `.claude/commands/validate.md`, writes `VALIDATION.md` with a fingerprint of the working tree, and logs `/story-validate completed`.
- **Retro step:** `/story-retro` is a main-session skill. It collects signals, runs `rules-check-drift`, asks about at most 5 one-line harness edits one at a time, applies the accepted ones and writes `RETRO.md`.
- **Single rules source:** a new shared `validation.md` holds the gates, the fingerprint command, the `VALIDATION.md` format and the **Current validation** rule.
- **Review gating:** `/story-review` and `story-reviewer` refuse to run without a current validation. A failed gate becomes the first blocker, `pre-existing:` when it points outside the story's files, and `approved` requires a passing validation.
- **Plan priming:** the architect invokes `prime-codebase`, scoped to what SPEC.md touches, before it explores.
- **Wiring:** next steps, vocabulary, the logs format, rules, the resume examples and `CLAUDE.md` now follow implement → validate → review → (fix → validate → review)* → retro.
- **Format gate:** `.prettierignore` now excludes `.agents/stories/` and `.claude/worktrees/`, so the format gate checks only code.

## Files created
- `.claude/shared/story/validation.md` — the gates (taken from validate.md steps 1–6), the gate execution command and how failures are handled, the fingerprint command, the `VALIDATION.md` format, and the **Current validation** rule.
- `.claude/skills/story-validate/SKILL.md` — the `/story-validate` command:
  - Preconditions: an implementation exists and the last command isn't a paused or failed implement.
  - Runs the gates one per Bash call and posts a progress line for each.
  - Computes the fingerprint, writes `VALIDATION.md`, logs, and hands off.
  - `allowed-tools` holds the validate.md pnpm entries plus the git, mktemp, tail, grep and date entries.
- `.claude/skills/story-retro/SKILL.md` — the `/story-retro` command, steps 1–10:
  - Precondition: the last command's `Next step:` starts with `/story-retro`.
  - Collects signals and runs `rules-check-drift` on `<merge-base>...HEAD`.
  - Builds at most 5 proposals under the qualifying rules and target list, and asks about each with `AskUserQuestion` (Accept/Reject, or free text, recorded as `edited`).
  - Applies the accepted ones, runs `prettier --write` on the changed files, writes the `RETRO.md` template, logs, and hands off.

## Files modified
- `.claude/shared/story/vocabulary.md`:
  - The **Review verdict** `approved` next step is now `/story-retro <id>`.
  - **Fix next step** is a single row, `/story-validate <id>`.
  - New **Validate & retro** section: Validation result, Gate result, Validation next step, Retro proposal outcome.
- `.claude/shared/story/logs-format.md`:
  - New `/story-validate completed` and `/story-retro completed` field lists, with a note that neither command logs paused or failed.
  - New Value shapes rows: `Validation`, `Gates passed`, `Failed gate`, `Files changed`.
  - `Proposals` joins the count-or-`none` row.
  - The example's implement next step is now `/story-validate GH-42`.
- `.claude/shared/story/rules.md`:
  - Records now lists `VALIDATION.md` and `RETRO.md` and says who writes them.
  - "Any other change" now hands off to `/story-validate <id>`.
  - New line: `/story-retro` edits only harness files whose edit the user accepted.
  - `validation.md` is added to the shared-files table (prettier re-aligned the table).
- `.claude/skills/story-implement/SKILL.md` — the `complete` next step is now `/story-validate <id>`.
- `.claude/skills/story-review/SKILL.md`:
  - The description mentions the validation requirement.
  - Step 1 checks **Current validation** and stops without logging if it fails.
  - Step 3 maps an error whose reason starts `no current validation` to `Next step: /story-validate <id>`.
- `.claude/agents/story-reviewer.md`:
  - Reads `VALIDATION.md` and applies **Current validation** before any review, returning an error if it isn't current.
  - A failed-gate blocker rule comes first, with `pre-existing:`, `Defect:`, `Also at:` and `Fix:` shapes.
  - Adds a `## Validation` section to the `REVIEW.md` template.
  - `approved` requires a passing current validation, and the error case now covers a missing or stale validation.
- `.claude/agents/story-architect.md` — Step 2 first invokes `prime-codebase` with the Skill tool, scoped by SPEC.md with no task reference, and skips its Output Report and Suggested Next Step (LOGS.md #7).
- `.claude/skills/story-fix/SKILL.md`:
  - New stop-and-ask: a fix that changes a file outside the story's changed files (a finding starting `pre-existing:`).
  - 6c says the next step is always `/story-validate <id>` (LOGS.md #9).
- `.claude/skills/story-resume/SKILL.md`:
  - Two new examples, for a failed validation and for approved and validated.
  - Updated the three existing examples that named the old next steps:
    - implement now goes to `/story-validate`, also in the manual-steps example
    - the `none` example is now the story-complete case
- `CLAUDE.md:92` — the story workflow line now includes `/story-validate` and `/story-retro`, with the fix loop.
- `.prettierignore` — a `# Local / agent artifacts` block with `.claude/worktrees/` and `.agents/stories/` (LOGS.md #8).

## Deviations from plan
None. A few small consistency choices, none of which change behavior:
- The `VALIDATION.md` template's drift-check line drops the `(LOGS.md #5)` citation. That entry exists only in GH-1's log and would be meaningless in other stories.
- The three stale `/story-resume` examples were updated.
- `Records` in rules.md now names the two new records.
- `Proposals` was added to the count-or-`none` value shape.
- `Accepted` counts include `edited` proposals.
- The reviewer's `VALIDATION.md` line names `/story-validate`.

## Known issues
- `pnpm format:check` fails today on `apps/web/e2e/tests/admin/admin-product-create.spec.ts`, `apps/web/src/app/actions/admin/products.ts` and `apps/web/src/lib/api.ts`. These files have CRLF line endings in the working tree but LF in the index (PLAN.md Concerns 1). No story artifacts or harness files are flagged, so the `.prettierignore` change works. `/story-validate GH-1` will fail at the format gate, and the review will raise a `pre-existing:` blocker.
- Lint, typecheck, test and build were not run (PLAN.md Concerns 2).
- Verification run:
  - `git grep` finds the new names in every planned place.
  - Every `shared/story/*.md` reference under `.claude/` exists.
  - The `name:` frontmatter matches the folder for both new skills.
  - `prettier --check` passes on every changed or new file under `.claude/` and on `CLAUDE.md`. `.prettierignore` itself has no prettier parser.
  - The fingerprint command gave the same hash twice on this branch.
- Not yet proven: running the loop end to end. The plan's proof is running `/story-validate GH-1` → `/story-review GH-1` → … → `/story-retro GH-1`.
- Unverified: whether `story-validate`'s `allowed-tools` pre-approves the compound gate commands (PLAN.md Concerns 5). In the worst case the user gets a permission prompt.

## Changes after implementation
None
