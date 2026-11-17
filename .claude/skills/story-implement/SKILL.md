---
name: story-implement
description: "Implements a story's PLAN.md by dispatching the implementer subagent, relaying its blocking questions and writing IMPLEMENTATION-SUMMARY.md."
argument-hint: '[<story-id>]'
disable-model-invocation: true
---

# /story-implement

Implement a story's plan, and document what was built in `IMPLEMENTATION-SUMMARY.md`.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/story-implement` is a thin dispatcher: the implementation happens in the `story-implementer` subagent's own context. See `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`.

## Step 1 — Resolve the story

Resolve `<story-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If `.agents/stories/<feature-name>/PLAN.md` is empty or missing, stop and tell the user:

> "No plan found for `<story-id>`. Run `/story-plan <id>` first."

---

## Step 2 — Dispatch to the implementer subagent

Dispatch the `story-implementer` subagent with the Agent tool (`subagent_type: story-implementer`). Its prompt must be **only** this line, per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

```
Implement the story at .agents/stories/<feature-name>/
```

---

## Step 3 — Handle the result

Per **Handling the result** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

- **`complete`** — write the `===IMPLEMENTATION-SUMMARY.md===` block to `.agents/stories/<feature-name>/IMPLEMENTATION-SUMMARY.md`. `Next step: /story-review <id>`.
- **`needs-input`** — if an answered question is one of `PLAN.md`'s **Open questions**, remove it per **Artifact ownership** in `rules.md`.
- **`error` / malformed** — when handing off, add that code may have changed on disk.
