---
name: ticket-plan
description: 'Writes the implementation plan in PLAN.md for a spec by dispatching the architect subagent'
argument-hint: '[<spec-id>]'
disable-model-invocation: true
---

# /plan

Write the technical plan for a spec in `PLAN.md`.

`rules.md` is `../../shared/ticket/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/plan` is a thin dispatcher: the planning happens in the `ticket-architect` subagent's own context. See `../../shared/ticket/delegated-work.md`.

## Step 1 — Resolve the spec

Resolve `<spec-id>` per `../../shared/ticket/spec-identifiers.md`.

If `<vault>/sb-ticket-artifacts/specs/<feature-name>/SPEC.md` is empty or missing, stop and tell the user:

> "No spec found for `<spec-id>`."

---

## Step 2 — Dispatch to the architect subagent

Invoke the `sb:ticket-architect` subagent. Its prompt must contain **only** these lines, with `<plugin-root>` per `../../shared/ticket/delegated-work.md`:

```
Plan the spec at <vault>/sb-ticket-artifacts/specs/<feature-name>/
Plugin root: <plugin-root>
```

---

## Step 3 — Handle the result

Per **Handling the result** in `../../shared/ticket/delegated-work.md`:

- **`complete`** — write the `===PLAN.md===` block to `<vault>/sb-ticket-artifacts/specs/<feature-name>/PLAN.md`. `Next step: /sb:ticket-implement <id>`.
  - If `Open questions` isn't `none`, after logging `/plan completed`, ask PLAN.md's **Open questions** one at a time in order. After each answer, update `PLAN.md` to match, per **Artifact ownership** in `rules.md`.
  - If the user defers a question, leave it in **Open questions**, log nothing for it, and move on.
  - If `Concerns` isn't `none`, the hand-off adds a `Concerns` list of PLAN.md's **Concerns**, copied verbatim.
