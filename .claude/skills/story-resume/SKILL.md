---
name: ticket-resume
description: 'Orients on one spec by reading its LOGS.md and showing the last entry and where the work stands.'
argument-hint: '[<spec-id>]'
disable-model-invocation: true
---

# /resume

Orient the agent on a spec's current state at the start of a new session.

`rules.md` is `../../shared/ticket/rules.md`. Read it before Step 1 unless its full text is already in your context.

## Step 1 — Locate the spec

`<spec-id>` = `$ARGUMENTS[0]`, if given.

Resolve `<spec-id>` per `../../shared/ticket/spec-identifiers.md`.

---

## Step 2 — Read the session history

Apply the **Always read LOGS.md first** rule from `rules.md`: read the full `LOGS.md` for the resolved spec folder.

If `LOGS.md` is empty or missing, the folder wasn't produced by `/sb:ticket-spec`. Tell the user:

> "Spec `<id>` has no LOGS.md at `<vault>/sb-ticket-artifacts/specs/<folder>/`. The ticket workflow can't resume it."

Then stop.

Otherwise, identify:

- **The last entry** in the file, command or change.
- **The last command entry** (`/<command> completed | paused | failed`) and the change entries after it. These drive `Where you are:`, even when the last entry is a change entry.

### Do not

- Read any artifact
- Read anything in `refs/`
- Read any source file, including files listed in `IMPLEMENTATION-SUMMARY.md`
- Write or edit any file, including `LOGS.md`

Artifacts, refs and code are loaded by the workflow command that needs them.

---

## Step 3 — Print the summary

Print exactly two lines, with a blank line between them:

```
Last entry: #<n> <timestamp> <type> — <what>

Where you are: <one-line synthesis>
```

`#<n>` and `<timestamp>` are the last entry's heading id and timestamp, as written. Leave out `#<n>` for an entry without an id. `<type>` and `<what>` depend on the entry:

| Last entry                | `<type>`               | `<what>`          |
| ------------------------- | ---------------------- | ----------------- |
| change entry              | its `Type:`            | its `What:`       |
| `completed` command entry | `/<command> completed` | its `Next step:`  |
| `paused` command entry    | `/<command> paused`    | its `Blocked on:` |
| `failed` command entry    | `/<command> failed`    | its `Reason:`     |

### Rules for the synthesis line

Base it on the last command entry's `Next step:`, in one sentence. Examples:

- `"Implementation finished. Next step: /sb:ticket-review k3f9."`
- `"Code review done with 2 blockers, 1 major. Next step: /sb:ticket-fix k3f9."`
- `"Spec written. Next step: /sb:ticket-plan k3f9."`

If the `Next step:` starts with `none`, say nothing is open and name the optional command, if any, per **Next step** in `../../shared/ticket/vocabulary.md`. E.g. `"Review clean, nothing open. Optional: /sb:ticket-fix k3f9 N1,N2."`

If the last command entry has `Manual steps:`, name them before the next command, e.g. `"Implementation finished. Restart the local API, then /sb:ticket-review k3f9."`

If the last command entry is `paused`, name what it's blocked on and how to pick it back up. The change entries after it are the user's answers so far. An answer whose `What:` starts with `not-answered-yet:` doesn't count until a later entry answers the same question: name the question and what the user needs to do before re-running. E.g. `"Paused during /sb:ticket-implement, blocked on: <Blocked on: value> — 2 answers logged. Re-run /sb:ticket-implement k3f9 to continue."`

If the last command entry is `failed`, give the reason and the re-run, e.g. `"/sb:ticket-review failed: <Reason: value>. Re-run /sb:ticket-review k3f9."` For a failed `/sb:ticket-implement`, add that code may have changed on disk.
