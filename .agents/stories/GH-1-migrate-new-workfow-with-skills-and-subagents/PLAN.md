# PLAN — Migrate new workfow with skills and subagents

## Overview

The rename and Claude Code port are already on the branch (`68656be`, `496b1b5`, `792f283`, `c856390`). This plan fills in what's still missing from SPEC.md: a validate step, priming in the plan step, a self-improvement (retro) step, and the next-step wiring that connects them.

- **`/story-validate`** is a new main-session skill. It runs the gates from `.claude/commands/validate.md` steps 1–6 (install, format check, lint, typecheck, test, build) and stops at the first failure. It writes `VALIDATION.md` to the story folder, including a fingerprint of the code it validated, and logs `/story-validate completed` (LOGS.md #3).
- **`/story-review`** and the `story-reviewer` subagent run only when the validation is current: it is logged after the last implement or fix, and its fingerprint matches the code as it is now. A failed gate becomes a blocker finding built from the output the validation saved, which `/story-fix` then applies like any other finding (LOGS.md #4).
- **`/story-retro`** is a new main-session skill and the step after an approved story. It reads `LOGS.md`, the review and validation records and the story diff, and runs `rules-check-drift`. It proposes at most 5 small edits to `CLAUDE.md`, `.claude/rules/` or `.claude/shared/story/`, asks about them one at a time, applies the ones the user accepts, and writes `RETRO.md` (LOGS.md #5).
- **The architect primes the codebase** by calling the `prime-codebase` skill, scoped to what SPEC.md touches, before it explores (LOGS.md #7).
- **Next steps become** implement → validate → review → (fix → validate → review)* → retro.

Nothing changes in `apps/` or `packages/` (SPEC.md Out of scope).

## Architecture

All changes are in the harness (`.claude/`), plus one line in `CLAUDE.md` and `.prettierignore`.

- **Main session (skills):** two new skills, `story-validate` and `story-retro`. They follow the existing story skill shape: frontmatter with `name`, `description`, `argument-hint: '[<story-id>]'` and `disable-model-invocation: true`; a `# /story-<cmd>` heading; the `rules.md` line; `## Step N — …` sections separated by `---`; and a hand-off at the end (see `.claude/skills/story-plan/SKILL.md:1-14`). Neither one is a subagent:
  - Validation needs no judgement. `/validate` itself runs in the main session (`.claude/commands/validate.md:8`).
  - Retro has to ask the user one proposal at a time, and subagents can't ask (`.claude/shared/story/delegated-work.md:6`).
  - So `delegated-work.md` and the three subagents stay as they are, except for the reviewer and architect edits below.
- **Shared rules:** a new `.claude/shared/story/validation.md` is the single source for:
  - where the gates come from
  - the `VALIDATION.md` format
  - the fingerprint command
  - the **Current validation** rule

  `/story-validate`, the `/story-review` dispatcher and `story-reviewer` all read it.
- **Subagents:**
  - `story-reviewer` gains a validation check, gate-failure blockers and a `## Validation` section in `REVIEW.md`.
  - `story-architect` gains a priming step.
- **Vocabulary and logs:**
  - new values: validation result, gate result, validation next step, retro proposal outcome
  - new `completed` field lists for `/story-validate` and `/story-retro`
  - changed next steps for implement, an approved review, and fix

Reused code with a side effect:

- `/validate` gates — `pnpm install` writes `node_modules`, and `pnpm build` writes `dist/` and `.next/` (all gitignored). The command changes no tracked files and never auto-fixes. Source: `.claude/commands/validate.md:56`: `This command does not modify any files. It only reports.` and `:8`: `**Stop on the first failure** — do not auto-fix unless the user explicitly asks.` `/story-validate` runs steps 1–6 as written there and does not invoke the `validate` skill, so it can record each gate's result and leave out step 7. The drift check moves to `/story-retro` (LOGS.md #5).
- `rules-check-drift` — read-only, and it applies edits only when the caller explicitly asks. Source: `.claude/skills/rules-check-drift/SKILL.md:46`: `Advisory only: apply edits only if the caller explicitly asks.` `/story-retro` calls it for findings only. The retro applies an edit itself, and only after the user accepts it.
- `prime-codebase` — read-only. It runs `gh` reads and `git` reads (`.claude/skills/prime-codebase/SKILL.md:36-37,100-102`), and its report ends by recommending `/planning` or `/execute` (`:143`). The architect uses what it loads and skips its **Output Report**.

## Data model

### `VALIDATION.md` (record, rewritten on every `/story-validate` run)

```markdown
# VALIDATION — <feature-name>

## Run

- Date: <YYYY-MM-DD HH:MM:SS, from the shell>
- Commit: <git rev-parse --short HEAD>
- Fingerprint: <40-hex from the fingerprint command>
- Result: <passed | failed>

## Gates

| #   | Gate         | Command                          | Result | Time |
| --- | ------------ | -------------------------------- | ------ | ---- |
| 1   | Install      | `pnpm install --frozen-lockfile` | pass   | 14s  |
| 2   | Format check | `pnpm format:check`              | fail   | 31s  |
| 3   | Lint         | `pnpm lint`                      | not-run | —   |
| ... |              |                                  |        |      |

## Failure

- Gate: <gate name> — `<command>` — exit <code>
- Points at: <comma-separated `file:line` taken from the output, or `none`>

```text
<output excerpt: every line naming a file:line, plus the tail, at most 200 lines>
```

## Not run here

- Rules drift check — runs in `/story-retro` (LOGS.md #5)
- E2E and the Docker build — skipped by `/validate` (`.claude/commands/validate.md:39-42`)
```

`## Failure` is present only when `Result` is `failed`. The gate names and commands are copied from `.claude/commands/validate.md:12-28`, never restated from memory. The table must list every gate in that file's order.

### `RETRO.md` (record, written once by `/story-retro`)

```markdown
# RETRO — <feature-name>

## Signals

- <LOGS.md #<n> | REVIEW.md <code> | VALIDATION.md> — <one line: what went wrong or had to be asked>

## Drift check

<rules-check-drift's output, verbatim, or its "no edits needed" line>

## Proposals

### P1 — <short title> — <accepted | rejected | edited>

- Target: `<file>:<line>`
- Edit: <the exact change: the line added, or old → new>
- Evidence: <comma-separated: LOGS.md #<n>, REVIEW.md <code>, `<file>:<line>`>
- Applied: <the final text when edited, otherwise omit>
```

Write `None` under Proposals when there are none.

### `LOGS.md` entries (in `.claude/shared/story/logs-format.md`, under "`completed` — per-command fields")

`/story-validate completed`:

- Validation (`passed` or `failed`)
- Gates passed (`<x> of <y>`)
- Failed gate (gate name, or `none`)
- Next step (per **Validation next step** in `vocabulary.md`)

`/story-retro completed`:

- Proposals (count, or `none`)
- Accepted (count)
- Rejected (count)
- Files changed (comma-separated paths, or `none`)
- Next step (`none — story complete`)

Add these rows to the **Value shapes** table:

- `Validation`: a validation result from `vocabulary.md`
- `Gates passed`: `<x> of <y>`
- `Failed gate`: a gate name from `.claude/commands/validate.md`, or `none`
- `Files changed`: comma-separated paths, or `none`

Neither command writes `paused` or `failed`. Their preconditions stop without logging, the same way `/story-plan` does (`.claude/skills/story-plan/SKILL.md:20-22`).

### `vocabulary.md` additions and changes

- New section **Validate & retro**, with:
  - **Validation result:**
    - `passed`: every gate passed
    - `failed`: a gate failed, and the later gates were `not-run`
  - **Gate result:** `pass`, `fail`, `not-run`
  - **Validation next step:**
    | Validation | Condition | Next step |
    | --- | --- | --- |
    | `failed` | any | `/story-review <id>` |
    | `passed` | the latest `/story-review completed` is `approved`, and every `/story-fix completed` after it has `New issues found: no` | `/story-retro <id>; optional: /story-review <id>` |
    | `passed` | otherwise | `/story-review <id>` |
  - **Retro proposal outcome:**
    - `accepted`
    - `rejected`
    - `edited`: the user replaced the text, and it was applied
- **Review verdict:** `approved` → `/story-retro <id>`, plus `; optional: /story-fix <id> <codes>` when there are minors (LOGS.md #5).
- **Fix next step:** a single row, `/story-validate <id>`, whatever the fix was fixed from, including a minor-only fix after an approved review (LOGS.md #3, #9).

## API / interfaces

### Fingerprint command (in `validation.md`; POSIX, run with the Bash tool)

```sh
cd "$(git rev-parse --show-toplevel)" || exit 1
base=$(git merge-base HEAD "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" 2>/dev/null) || base=$(git rev-parse HEAD)
untracked=$(git ls-files --others --exclude-standard -- . ':(exclude).agents/stories')
{
  echo "$base"
  git diff "$base" --binary -- . ':(exclude).agents/stories'
  printf '%s\n' "$untracked"
  if [ -n "$untracked" ]; then printf '%s\n' "$untracked" | git hash-object --stdin-paths; fi
} | git hash-object --stdin
```

- **What it hashes:** everything the story changed since the base: committed, uncommitted and untracked files, but not story artifacts.
- **Read-only:** `hash-object` without `-w` writes nothing, so the reviewer can run it under its read-only-git rule (`.claude/agents/story-reviewer.md:26`).
- **Content-based:** committing doesn't change the fingerprint, but editing, adding or rebasing does.
- **Verified:** run twice during planning on this branch, it gave the same hash both times.

### Gate execution (in `story-validate`, one Bash call per gate)

```sh
log=$(mktemp); start=$(date +%s); <command> >"$log" 2>&1; code=$?; echo "exit=$code elapsed=$(( $(date +%s) - start ))s"; tail -n 15 "$log"
```

- **On a non-zero exit:**
  1. Read `"$log"`, taking every line that names a `file:line` (grep for `:[0-9]+`), plus the last 60 lines, at most 200 in total.
  2. Record the gate as `fail`.
  3. Mark the later gates `not-run` and stop.
- **Why a temp file:** it keeps successful gate output out of the context.

### Current validation (in `validation.md`; applied by `/story-review` Step 1 and by `story-reviewer` Step 1)

A validation is current when all of these hold:

1. `VALIDATION.md` exists.
2. `LOGS.md` has a `/story-validate completed` entry after the last `/story-implement completed` and the last `/story-fix completed`.
3. `VALIDATION.md`'s `Fingerprint` equals the fingerprint command's output now.

It counts as passing only if it is current and `Result` is `passed`.

## File structure

### New files

- `.claude/shared/story/validation.md`. It holds:
  - **Gates:** "steps 1–6 of `.claude/commands/validate.md`, in order, commands as written there"
  - **Fingerprint:** the command above
  - **`VALIDATION.md` format**
  - **Current validation**

  It follows the sibling shared files: an H1 title, a one-paragraph intro, `##` sections, and links to siblings as `./vocabulary.md` (like `.claude/shared/story/logs-format.md:5`). Size: about 60–90 lines, in the 15–211 range of its siblings.
- `.claude/skills/story-validate/SKILL.md`, about 80–110 lines. The frontmatter copies the story skills' (`.claude/skills/story-review/SKILL.md:1-6`) and adds an `allowed-tools` line following `.claude/commands/validate.md:3`: the same `pnpm` entries without `Skill(rules-check-drift)`, plus `Bash(git rev-parse:*)`, `Bash(git merge-base:*)`, `Bash(git symbolic-ref:*)`, `Bash(git ls-files:*)`, `Bash(git diff:*)`, `Bash(git hash-object:*)`, `Bash(mktemp:*)`, `Bash(tail:*)`, `Bash(grep:*)`, `Bash(date:*)`. Steps:
  1. **Resolve the story** per `story-identifiers.md`.
     - If `IMPLEMENTATION-SUMMARY.md` is missing, stop with "No implementation found for `<story-id>`. Run `/story-implement <id>` first."
     - If the last command entry is `/story-implement paused` or `/story-implement failed`, stop with "`/story-implement` hasn't completed for `<id>`. Re-run `/story-implement <id>` first."
  2. **Run the gates** per `validation.md`, one at a time, stopping at the first failure. Post one progress line per gate (`✅ Lint 42s` / `❌ Lint 42s`), as `.claude/commands/validate.md:35` does. Never fix anything.
  3. **Fingerprint:** compute it after the gates have run.
  4. **Write `VALIDATION.md`.**
  5. **Log:** append `/story-validate completed`, with `Next step:` per **Validation next step**.
  6. **Hand off:**
     ```
     /story-validate <id> completed
     Artifact: `.agents/stories/<feature-name>/VALIDATION.md`
     Validation: <passed | failed> — <x> of <y> gates passed<; failed at <gate>>
     Next: <the entry's Next step:>
     ```
- `.claude/skills/story-retro/SKILL.md`, about 110–150 lines, with the same frontmatter shape and no `allowed-tools`. Steps are in **Logic & business rules**.

### Modified files

- `.claude/shared/story/vocabulary.md` — the additions and changes in **Data model**. Also change **Command status** `paused` "Written when" to keep only `plan` and `implement`, which it already says (no change needed there).
- `.claude/shared/story/logs-format.md` — the two new `completed` field lists and the new value shapes. In `paused`, it still says `/story-plan` and `/story-implement` only.
- `.claude/shared/story/rules.md`:
  - **Artifact ownership**, the Records bullet (`:41`): add "`/story-validate` writes `VALIDATION.md` on each run; `/story-retro` writes `RETRO.md`."
  - **Changes between commands**, "Any other change" (`:50`): hand off to `/story-validate <id>` instead of `/story-review <id>`.
  - **Path conventions** table (`:93`): add `validation.md` to the shared-files list.
  - Add one line under **Changes between commands**: "`/story-retro` edits only harness files whose edit the user accepted."
- `.claude/skills/story-implement/SKILL.md:40` — `Next step: /story-validate <id>`.
- `.claude/skills/story-review/SKILL.md`:
  - Step 1, after the `IMPLEMENTATION-SUMMARY.md` check: check **Current validation** per `validation.md`, ordering and fingerprint both. If it fails, stop with no log entry: "No current validation for `<story-id>` (<which check failed>). Run `/story-validate <id>` first."
  - Step 3: an `error` whose `Reason:` starts with `no current validation` is logged as `failed` with `Next step: /story-validate <id>`.
  - Description: mention that it requires a current validation.
- `.claude/agents/story-reviewer.md`:
  - Step 1: also read `<folder>/VALIDATION.md`. Before reviewing any code, apply **Current validation** from `.claude/shared/story/validation.md`. If it fails, return `error` with `Reason: no current validation — <which check failed>`.
  - Step 2: add "Validation: if `VALIDATION.md`'s `Result` is `failed`, the failed gate is a `blocker`, numbered before every other blocker."
    - Location: the first `Points at` entry (or the gate command when `none`).
    - Description: the error quoted from `## Failure`.
    - `Defect: <gate> gate fails: <error class>`
    - `Also at:` the remaining `Points at` entries.
    - `Fix:` one concrete change.
    - If every `Points at` file is outside the story's changed files, the description starts `pre-existing:`.
  - Add the rule "`approved` requires a passing current validation" next to the verdict line (`:118`).
  - `REVIEW.md` template: add a `## Validation` section after Summary: `<passed | failed at <gate>> — VALIDATION.md <date>, LOGS.md #<n>, fingerprint matched`.
  - Error case: add the stale or missing validation case.
- `.claude/skills/story-fix/SKILL.md` Step 5 — add a stop-and-ask bullet: "A fix changes a file outside the story's changed files (a finding starting `pre-existing:`)." `Next step:` still comes from **Fix next step**, which now always says `/story-validate <id>`.
- `.claude/skills/story-resume/SKILL.md:71-73` — add two examples: `"Validation failed at lint. Next step: /story-review k3f9."` and `"Review approved and validated. Next step: /story-retro k3f9."`
- `.claude/agents/story-architect.md` Step 2 — before exploring, invoke `prime-codebase` with the Skill tool. Pass a scope argument naming the apps, modules, aspects or paths SPEC.md touches, per its Argument Parsing table (`.claude/skills/prime-codebase/SKILL.md:17-26`), and no task reference: SPEC.md is the task. Use what it loads, and skip its Output Report and Suggested Next Step (`:104-143`). Calling it with the Skill tool, not preloading it, is per LOGS.md #7.
- `CLAUDE.md:92` — the flow becomes: `/story-init` → `/story-spec` → `/story-plan` → `/story-implement` → `/story-validate` → `/story-review` → `/story-fix` (then `/story-validate` → `/story-review` until approved) → `/story-retro`, with `/story-resume` to pick up a story.
- `.prettierignore` — add `.claude/worktrees/` and `.agents/stories/` (LOGS.md #8) under a `# Local / agent artifacts` comment after `:19`. The format gate then checks code only, and story markdown is never auto-formatted.

## Logic & business rules

### `/story-retro` steps

1. **Resolve the story.** If the last command entry's `Next step:` doesn't start with `/story-retro`, stop and log nothing: "Story `<id>` isn't ready for a retro. Its next step is: `<Next step:>`."
2. **Read** `LOGS.md` (all of it), `SPEC.md`, `PLAN.md`, `REVIEW.md` (including Fix Summaries), `VALIDATION.md`, and every `.agents/stories/*/RETRO.md` from other stories. Then read the story diff: changed files since the base, committed or not, with `.agents/stories/` excluded. The base is the one the reviewer uses (`.claude/agents/story-reviewer.md:26`).
3. **Collect signals:**
   - each `deviation`, `correction` and `blocker` change entry
   - each `paused` command and its answered questions, especially questions the repo should have answered (`rules.md:17`)
   - each `failed` command
   - each `/story-validate completed` with `Validation: failed`
   - each `REVIEW.md` finding that cites a project standard, or whose `Defect` repeats
   - each hook block
4. **Run the drift check:** invoke `rules-check-drift` with the range `<base>...HEAD`.
5. **Build proposals,** at most 5, strongest evidence first. A proposal qualifies only if all of these hold:
   - the evidence shows an agent got something wrong, or had to ask what the repo should answer
   - it would recur in another story
   - `grep` finds no existing line in the target that already says it
   - it fits in one line in the narrowest file whose scope covers it (`.claude/skills/rules-check-drift/SKILL.md:22`)
   - it isn't recorded as `rejected` in another story's `RETRO.md` for the same target and edit
   - it doesn't record that a feature was added or restate the code (`rules-check-drift/SKILL.md:24`)

   Targets are only these (LOGS.md #5): root `CLAUDE.md`, `apps/web/CLAUDE.md`, `.claude/rules/**`, `.claude/shared/story/**`. Every drift-check finding becomes a proposal, and counts toward the 5. Zero proposals is a valid outcome.
6. **Ask about each proposal,** one at a time, with `AskUserQuestion`. Show the target `file:line`, the exact edit and the evidence. The options are `Accept` and `Reject`. A free-text reply is the edited text: apply it as `edited`.
7. **Apply** the accepted and edited edits. Then run `pnpm exec prettier --write <each changed file>` (`.claude/settings.local.json` allows `Bash(pnpm exec *)`). Retro touches no file other than those targets, `RETRO.md` and `LOGS.md`.
8. **Write `RETRO.md`.**
9. **Log** `/story-retro completed`. Don't add change entries per proposal: `RETRO.md` and the counts record them (`rules.md:68`).
10. **Hand off:**
    ```
    /story-retro <id> completed
    Artifact: `.agents/stories/<feature-name>/RETRO.md`
    Proposals: <n> — accepted <a>, rejected <r>
    Files changed:
    - <path>
    Next: none — story complete
    ```

### Loop invariants

- `approved` can't happen without a current, passing validation:
  - `/story-review` won't dispatch without a current validation.
  - The reviewer re-checks it independently.
  - A failed gate is always a blocker, so the verdict is `fix-needed`.
- Every code change goes through `/story-validate`:
  - implement → validate
  - fix → validate
  - a between-commands change → validate (the `rules.md` change)
- A validation whose next step is retro has `passed` after the approved review's follow-up fixes.

### Edge cases

- **Fix applied nothing:** after a fix that skipped every finding, the fingerprint is unchanged. `/story-validate` still re-runs the gates, which keeps the rule simple.
- **Install fails:** the failure has no `file:line` (for example, the lockfile is out of sync). `Points at: none`, and the blocker's location is the gate command.
- **Stale validation:** a stale fingerprint is caught before any review work. The reviewer checks it first in Step 1.
- **Base can't be found:** if `git symbolic-ref` fails, the fingerprint falls back to `HEAD` as the base. Validation and review run on the same machine, so the fallback is consistent.

### Verification (implementer, before returning)

- `git grep -nE 'story-(validate|retro)' -- .claude CLAUDE.md` shows the new names wherever they're wired:
  - `vocabulary.md`
  - `logs-format.md`
  - `rules.md`
  - the implement, review, fix and resume skills
  - the reviewer
  - `CLAUDE.md:92`
- Every `shared/story/<file>.md` referenced under `.claude/` exists. Check with the link check from `refs/story-harness-adaptation-plan-2026-11-16.md:346`.
- The `name:` frontmatter matches the folder for both new skills.
- `pnpm exec prettier --check` passes on every changed or new file under `.claude/`, plus `CLAUDE.md`.
- The end-to-end proof is this story itself: `/story-validate GH-1` → `/story-review GH-1` → … → `/story-retro GH-1` after the implementation.

## Dependencies

None. This plan uses only existing tools:

- `pnpm` scripts (`package.json:4-11`)
- the `rules-check-drift` and `prime-codebase` skills
- `git`
- `AskUserQuestion`

## Open questions

none

## Concerns

- **On this machine, the format gate fails today on three files that `/story-validate` doesn't touch.** `apps/web/src/lib/api.ts`, `apps/web/src/app/actions/admin/products.ts` and `apps/web/e2e/tests/admin/admin-product-create.spec.ts` have CRLF line endings in the working tree but LF in the index (`git ls-files --eol`: `i/lf w/crlf`; `core.autocrlf=true`). The loop will turn this into a `pre-existing:` blocker and a stop-and-ask in `/story-fix`. Running `pnpm exec prettier --write` on those three files restores LF with no git diff. A lasting fix (`.gitattributes` `* text=auto eol=lf`) is outside this story. Source: `.prettierrc.json:9`. Spec: SPEC.md:29.
- **Lint, typecheck, test and build weren't run during planning.** Whether they pass locally right now is unverified. If they don't, this story's own validation will fail on code it didn't change. Source: `.claude/commands/validate.md:18-28`. Spec: SPEC.md:29.
- **`prime-codebase` is stale against `CLAUDE.md`.** Its description says Next.js 15, but `CLAUDE.md:5` says Next.js 16, and its Suggested Next Step points at `/planning` and `/execute`. The architect is told to skip the report. Fixing the skill is left out of this story (no drive-by refactors, `CLAUDE.md:15`), as a candidate for `/story-retro`. Source: `.claude/skills/prime-codebase/SKILL.md:3`. Spec: none.
- **The current branch doesn't name this story.** `ecom-1-story-workflow-migration` doesn't name `GH-1` by the branch rule, so story commands without an id won't infer this story. Pass `GH-1` explicitly. Source: `.claude/shared/story/story-identifiers.md:35`. Spec: none.
- **It's unverified whether `story-validate`'s `allowed-tools` pre-approves the compound gate commands** (`mktemp`, redirection, `tail`) (unverified). This user's local settings already allow `Bash(pnpm *)`, so the worst case is a permission prompt. Source: `.claude/settings.local.json`. Spec: none.
