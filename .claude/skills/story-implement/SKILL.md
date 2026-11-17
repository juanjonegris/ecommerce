---
name: story-implement
description: "Implements a spec's PLAN.md by dispatching the implementer subagent, relaying its blocking questions and writing IMPLEMENTATION-SUMMARY.md."
argument-hint: '[<spec-id>]'
disable-model-invocation: true
---

# /implement

Implement a spec's plan, and document what was built in `IMPLEMENTATION-SUMMARY.md`.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/implement` is a thin dispatcher: the implementation happens in the `story-implementer` subagent's own context. See `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`.

## Step 1 — Resolve the spec

Resolve `<spec-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If `.agents/stories/<feature-name>/PLAN.md` is empty or missing, stop and tell the user:

> "No plan found for `<spec-id>`. Run `/story-plan <id>` first."

---

## Step 2 — Dispatch to the implementer subagent

Invoke the `story-implementer` subagent. Its prompt must contain **only** these lines, with `<plugin-root>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

```
Implement the spec at .agents/stories/<feature-name>/
Plugin root: <plugin-root>
```

---

## Step 3 — Handle the result

Per **Handling the result** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

- **`complete`** — write the `===IMPLEMENTATION-SUMMARY.md===` block to `.agents/stories/<feature-name>/IMPLEMENTATION-SUMMARY.md`. `Next step: /story-review <id>`.
- **`needs-input`** — if an answered question is one of `PLAN.md`'s **Open questions**, remove it per **Artifact ownership** in `rules.md`.
- **`error` / malformed** — when handing off, add that code may have changed on disk.
