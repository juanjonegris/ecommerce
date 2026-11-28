---
name: story-validate
description: "Runs the project's validation gates (install, format check, lint, typecheck, test, build) against an implemented story, writes VALIDATION.md with a fingerprint of the validated code, and logs the result. /story-review needs a current validation."
argument-hint: '[<story-id>]'
disable-model-invocation: true
allowed-tools: Bash(pnpm install:*), Bash(pnpm exec prettier:*), Bash(pnpm format:check:*), Bash(pnpm lint:*), Bash(pnpm typecheck:*), Bash(pnpm test:*), Bash(pnpm build:*), Bash(git rev-parse:*), Bash(git merge-base:*), Bash(git symbolic-ref:*), Bash(git ls-files:*), Bash(git diff:*), Bash(git hash-object:*), Bash(mktemp:*), Bash(tail:*), Bash(grep:*), Bash(date:*)
---

# /story-validate

Run the validation gates against a story's code, and record the result in `VALIDATION.md`.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/story-validate` runs in the main session: the gates need no judgement. Everything it runs, computes and writes is defined in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/validation.md`. Read it before Step 2.

## Step 1 — Resolve the story

Resolve `<story-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If `.agents/stories/<feature-name>/IMPLEMENTATION-SUMMARY.md` is empty or missing, stop and tell the user, logging nothing:

> "No implementation found for `<story-id>`. Run `/story-implement <id>` first."

If the last command entry in `LOGS.md` is `/story-implement paused` or `/story-implement failed`, stop and tell the user, logging nothing:

> "`/story-implement` hasn't completed for `<id>`. Re-run `/story-implement <id>` first."

---

## Step 2 — Run the gates

Run the gates per **Gates** in `validation.md`: one at a time, in order, each in its own Bash call, stopping at the first failure. Run every gate on every run, even when nothing changed since the last validation.

After each gate, post one progress line with its result and time, in this form:

```
✅ Lint 42s
❌ Lint 42s
```

Never fix anything, not even a format failure, and never suggest a fix here: a failed gate becomes a review finding, and `/story-fix` applies it.

---

## Step 3 — Compute the fingerprint

After the gates have run, compute the fingerprint per **Fingerprint** in `validation.md`. Computing it after the gates makes it describe the code the gates actually saw.

---

## Step 4 — Write `VALIDATION.md`

Write `.agents/stories/<feature-name>/VALIDATION.md` per **`VALIDATION.md` format** in `validation.md`, replacing any earlier one.

- `Date:` comes from the shell (`date '+%Y-%m-%d %H:%M:%S'`), and `Commit:` from `git rev-parse --short HEAD`.
- `Result:` is a **Validation result** from `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`, and each gate's result is a **Gate result**.
- When a gate failed, fill `## Failure` from its output per **Gates** in `validation.md`.

---

## Step 5 — Log

Append `/story-validate completed` to `.agents/stories/<feature-name>/LOGS.md` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/logs-format.md`, with `Next step:` per **Validation next step** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`.

`/story-validate` never logs `paused` or `failed`: a failed gate is a `completed` run with `Validation: failed`.

---

## Step 6 — Hand off to user

Hand off per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/result-format.md`.

```
/story-validate <id> completed
Artifact: `.agents/stories/<feature-name>/VALIDATION.md`
Validation: <passed | failed> — <x> of <y> gates passed<; failed at <gate>>
Next: <the entry's Next step:>
```
