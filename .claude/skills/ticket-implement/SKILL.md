---
name: ticket-implement
description: "Implements a spec's PLAN.md by dispatching the implementer subagent, relaying its blocking questions and writing IMPLEMENTATION-SUMMARY.md."
argument-hint: '[<spec-id>]'
disable-model-invocation: true
---

# /implement

Implement a spec's plan, and document what was built in `IMPLEMENTATION-SUMMARY.md`.

`rules.md` is `../../shared/ticket/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/implement` is a thin dispatcher: the implementation happens in the `ticket-implementer` subagent's own context. See `../../shared/ticket/delegated-work.md`.

## Step 1 — Resolve the spec

Resolve `<spec-id>` per `../../shared/ticket/spec-identifiers.md`.

If `<vault>/sb-ticket-artifacts/specs/<feature-name>/PLAN.md` is empty or missing, stop and tell the user:

> "No plan found for `<spec-id>`. Run `/sb:ticket-plan <id>` first."

---

## Step 2 — Dispatch to the implementer subagent

Invoke the `sb:ticket-implementer` subagent. Its prompt must contain **only** these lines, with `<plugin-root>` per `../../shared/ticket/delegated-work.md`:

```
Implement the spec at <vault>/sb-ticket-artifacts/specs/<feature-name>/
Plugin root: <plugin-root>
```

---

## Step 3 — Handle the result

Per **Handling the result** in `../../shared/ticket/delegated-work.md`:

- **`complete`** — write the `===IMPLEMENTATION-SUMMARY.md===` block to `<vault>/sb-ticket-artifacts/specs/<feature-name>/IMPLEMENTATION-SUMMARY.md`. `Next step: /sb:ticket-review <id>`.
- **`needs-input`** — if an answered question is one of `PLAN.md`'s **Open questions**, remove it per **Artifact ownership** in `rules.md`.
- **`error` / malformed** — when handing off, add that code may have changed on disk.
