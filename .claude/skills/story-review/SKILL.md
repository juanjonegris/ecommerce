---
name: story-review
description: "Reviews an implemented spec against its SPEC.md, its PLAN.md, and the project's own standards through the isolated, read-only reviewer subagent, and writes REVIEW.md with coded findings (B/M/N/S) and a verdict."
argument-hint: '[<spec-id>]'
disable-model-invocation: true
---

# /review

Review the implemented code against the plan, the spec, and the project's own standards.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/review` is a thin dispatcher: the review happens in the isolated `story-reviewer` subagent's own context. See `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`. Passing it anything beyond Step 2's prompt defeats the point of isolating it.

## Step 1 — Resolve the spec

Resolve `<spec-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If `.agents/stories/<feature-name>/IMPLEMENTATION-SUMMARY.md` is empty or missing, stop and tell the user:

> "No implementation found for `<spec-id>`. Run `/story-implement <id>` first."

---

## Step 2 — Dispatch to the reviewer subagent

Invoke the `story-reviewer` subagent. Its prompt must contain **only** these lines, with `<plugin-root>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

```
Review the spec at .agents/stories/<feature-name>/
Plugin root: <plugin-root>
```

---

## Step 3 — Handle the result

Per **Handling the result** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`.

- **`complete`** — write the `===REVIEW.md===` block to `.agents/stories/<feature-name>/REVIEW.md`. Take `Next step:` per **Review verdict** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`.
