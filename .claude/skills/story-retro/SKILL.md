---
name: story-retro
description: 'Runs the self-improvement step after an approved, validated story: reads its LOGS.md, review, validation and diff, runs rules-check-drift, proposes small edits to CLAUDE.md, .claude/rules/ or the story workflow files one at a time, applies the accepted ones, and writes RETRO.md.'
argument-hint: '[<story-id>]'
disable-model-invocation: true
---

# /story-retro

Learn from a finished story: propose small, evidence-backed edits to the AI layer, and apply the ones the user accepts.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/story-retro` runs in the main session, because it asks the user about each proposal and subagents can't ask (`${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`).

## Step 1 — Resolve the story

Resolve `<story-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If the last command entry's `Next step:` in `LOGS.md` doesn't start with `/story-retro`, stop and tell the user, logging nothing:

> "Story `<id>` isn't ready for a retro. Its next step is: `<Next step:>`."

---

## Step 2 — Read the story

Read, from `.agents/stories/<feature-name>/`:

- `LOGS.md`, all of it
- `SPEC.md` and `PLAN.md`
- `REVIEW.md`, including every Fix Summary
- `VALIDATION.md`

Also read every `.agents/stories/*/RETRO.md` from other stories, for proposals already rejected.

Then read the story diff: every file changed since the base, committed or not, untracked included, with `.agents/stories/` excluded. The base is the one the reviewer uses: the output of `git symbolic-ref --short refs/remotes/origin/HEAD` (`.claude/agents/story-reviewer.md`). Use the shell only for read-only git commands.

---

## Step 3 — Collect signals

A signal is evidence that an agent got something wrong or had to ask. Collect:

- each `deviation`, `correction` and `blocker` change entry
- each `paused` command and its answered questions, especially a question the repo should have answered (**Stop and ask** in `rules.md`)
- each `failed` command
- each `/story-validate completed` with `Validation: failed`
- each `REVIEW.md` finding that cites a project standard, or whose `Defect:` repeats
- each hook block

---

## Step 4 — Run the drift check

Get the merge base of `HEAD` and the base from Step 2, then invoke the `rules-check-drift` skill with the range `<merge-base>...HEAD`. Use its findings only: don't ask it to apply anything.

---

## Step 5 — Build proposals

Build at most 5 proposals, strongest evidence first. A proposal qualifies only if all of these hold:

- the evidence shows an agent got something wrong, or had to ask what the repo should answer
- it would recur in another story
- `grep` finds no existing line in the target that already says it
- it fits in one line, in the narrowest file whose scope covers it (`.claude/skills/rules-check-drift/SKILL.md:22`)
- no other story's `RETRO.md` records it as `rejected` for the same target and edit
- it doesn't record that a feature was added, or restate the code (`.claude/skills/rules-check-drift/SKILL.md:24`)

A proposal targets only one of these:

- root `CLAUDE.md`
- `apps/web/CLAUDE.md`
- `.claude/rules/**`
- `.claude/shared/story/**`

Every drift-check finding becomes a proposal, and counts toward the 5. Zero proposals is a valid outcome: skip to Step 8.

---

## Step 6 — Ask about each proposal

Ask about the proposals one at a time, in order, with the `AskUserQuestion` tool. Show the target `file:line`, the exact edit (the line added, or old → new) and the evidence. The options are `Accept` and `Reject`. A free-text reply is the user's edited text: apply it, recorded as `edited`.

Each outcome is a **Retro proposal outcome** from `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`.

---

## Step 7 — Apply

Apply every `accepted` and `edited` proposal to its target. Then run `pnpm exec prettier --write <file>` on each changed file. Handle every hook per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/project-hooks.md`.

Touch no file other than the accepted targets, `RETRO.md` and `LOGS.md`.

---

## Step 8 — Write `RETRO.md`

Write `.agents/stories/<feature-name>/RETRO.md`:

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
- Applied: <the final text when edited; leave the line out otherwise>
```

Write `None` under **Signals** or **Proposals** when there are none.

---

## Step 9 — Log

Append `/story-retro completed` to `.agents/stories/<feature-name>/LOGS.md` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/logs-format.md`, with `Next step: none — story complete`.

Don't add a change entry per proposal: `RETRO.md` and the entry's counts record them (**When NOT to log** in `rules.md`). `/story-retro` never logs `paused` or `failed`.

---

## Step 10 — Hand off to user

Hand off per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/result-format.md`.

```
/story-retro <id> completed
Artifact: `.agents/stories/<feature-name>/RETRO.md`
Proposals: <n> — accepted <a>, rejected <r>
Files changed:
- <path>
Next: none — story complete
```
