---
name: ticket-review
description: "Reviews an implemented spec against its SPEC.md, its PLAN.md, and the project's own standards through the isolated, read-only reviewer subagent, and writes REVIEW.md with coded findings (B/M/N/S) and a verdict."
argument-hint: '[<spec-id>]'
disable-model-invocation: true
---

# /review

Review the implemented code against the plan, the spec, and the project's own standards.

`rules.md` is `../../shared/ticket/rules.md`. Read it before Step 1 unless its full text is already in your context.

`/review` is a thin dispatcher: the review happens in the isolated `ticket-reviewer` subagent's own context. See `../../shared/ticket/delegated-work.md`. Passing it anything beyond Step 2's prompt defeats the point of isolating it.

## Step 1 — Resolve the spec

Resolve `<spec-id>` per `../../shared/ticket/spec-identifiers.md`.

If `<vault>/sb-ticket-artifacts/specs/<feature-name>/IMPLEMENTATION-SUMMARY.md` is empty or missing, stop and tell the user:

> "No implementation found for `<spec-id>`. Run `/sb:ticket-implement <id>` first."

---

## Step 2 — Dispatch to the reviewer subagent

Invoke the `sb:ticket-reviewer` subagent. Its prompt must contain **only** these lines, with `<plugin-root>` per `../../shared/ticket/delegated-work.md`:

```
Review the spec at <vault>/sb-ticket-artifacts/specs/<feature-name>/
Plugin root: <plugin-root>
```

---

## Step 3 — Handle the result

Per **Handling the result** in `../../shared/ticket/delegated-work.md`.

- **`complete`** — write the `===REVIEW.md===` block to `<vault>/sb-ticket-artifacts/specs/<feature-name>/REVIEW.md`. Take `Next step:` per **Review verdict** in `../../shared/ticket/vocabulary.md`.
