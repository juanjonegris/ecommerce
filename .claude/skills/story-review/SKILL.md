---
name: story-review
description: "Reviews an implemented, validated story against its SPEC.md, its PLAN.md, its latest validation, and the project's own standards through the isolated, read-only reviewer subagent, and writes REVIEW.md with coded findings (B/M/N/S) and a verdict. Requires a current validation from /story-validate."
argument-hint: '[<story-id>]'
disable-model-invocation: true
---

# /story-review

Review the implemented code against the plan, the spec, and the project's own standards.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/story-review` is a thin dispatcher: the review happens in the isolated `story-reviewer` subagent's own context. See `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`. Passing it anything beyond Step 2's prompt defeats the point of isolating it.

## Step 1 — Resolve the story

Resolve `<story-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If `.agents/stories/<feature-name>/IMPLEMENTATION-SUMMARY.md` is empty or missing, stop and tell the user:

> "No implementation found for `<story-id>`. Run `/story-implement <id>` first."

Then check **Current validation** per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/validation.md`, the `LOGS.md` ordering and the fingerprint both. If the validation isn't current, stop and tell the user, logging nothing:

> "No current validation for `<story-id>` (<which check failed>). Run `/story-validate <id>` first."

---

## Step 2 — Dispatch to the reviewer subagent

Dispatch the `story-reviewer` subagent with the Agent tool (`subagent_type: story-reviewer`). Its prompt must be **only** this line, per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

```
Review the story at .agents/stories/<feature-name>/
```

---

## Step 3 — Handle the result

Per **Handling the result** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`.

- **`complete`** — write the `===REVIEW.md===` block to `.agents/stories/<feature-name>/REVIEW.md`. Take `Next step:` per **Review verdict** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`.
- **`error`** whose `Reason:` starts with `no current validation` — log `/story-review failed` as usual, with `Next step: /story-validate <id>`.
