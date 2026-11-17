---
name: story-plan
description: 'Writes the implementation plan in PLAN.md for a story by dispatching the architect subagent'
argument-hint: '[<story-id>]'
disable-model-invocation: true
---

# /story-plan

Write the technical plan for a story in `PLAN.md`.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/story-plan` is a thin dispatcher: the planning happens in the `story-architect` subagent's own context. See `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`.

## Step 1 — Resolve the story

Resolve `<story-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

If `.agents/stories/<feature-name>/SPEC.md` is empty or missing, stop and tell the user:

> "No SPEC.md found for `<story-id>`. Run `/story-spec` first."

---

## Step 2 — Dispatch to the architect subagent

Dispatch the `story-architect` subagent with the Agent tool (`subagent_type: story-architect`). Its prompt must be **only** this line, per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

```
Plan the story at .agents/stories/<feature-name>/
```

---

## Step 3 — Handle the result

Per **Handling the result** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/delegated-work.md`:

- **`complete`** — write the `===PLAN.md===` block to `.agents/stories/<feature-name>/PLAN.md`. `Next step: /story-implement <id>`.
  - If `Open questions` isn't `none`, after logging `/story-plan completed`, ask PLAN.md's **Open questions** one at a time in order. After each answer, update `PLAN.md` to match, per **Artifact ownership** in `rules.md`.
  - If the user defers a question, leave it in **Open questions**, log nothing for it, and move on.
  - If `Concerns` isn't `none`, the hand-off adds a `Concerns` list of PLAN.md's **Concerns**, copied verbatim.
