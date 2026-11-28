# LOGS.md format

Every command appends an entry to `LOGS.md` when it completes, pauses, or fails, and **change entries** are appended in between as work happens. All entries follow the same strict schema.

This guide defines the schema. The discipline (when to log, when not to) lives in [`rules.md`](./rules.md) under "Logging discipline". Every fixed value — statuses, change types, triggers, verdicts — is defined in [`vocabulary.md`](./vocabulary.md).

---

## Required structure

```
## #<n> — <YYYY-MM-DD HH:MM:SS> — /story-<command> <status>
- <field>: <value>
- <field>: <value>
- ...
- Next step: <next-command-or-action>
```

## Rules

1. **Heading** — `H2` (`##`), exact format: `#<n> — <YYYY-MM-DD HH:MM:SS> — /story-<command> <status>`
   - `#<n>` is the entry's id: the number of `## ` headings in `LOGS.md` plus 1. Never write one from memory or work it out from earlier entries. Get it from the shell, with `<log>` the story's `LOGS.md` path:

     ```
     # POSIX
     echo $(( $(cat <log> 2>/dev/null | grep -c '^## ') + 1 ))

     # PowerShell
     if (Test-Path <log>) { @(Select-String -Path <log> -Pattern '^## ').Count + 1 } else { 1 }
     ```

   - Date and time use 24-hour local time, e.g. `2026-05-08 14:32:07`
   - Get the timestamp from the shell: `date '+%Y-%m-%d %H:%M:%S'` (POSIX) or `Get-Date -Format 'yyyy-MM-dd HH:mm:ss'` (PowerShell). Never write one from memory or copy it from an earlier entry
   - Get the id and the timestamp right before appending, in the same step
   - `<status>` is a **command status** from `vocabulary.md`
   - An entry written before ids has no `#<n>`; refer to it by its timestamp

2. **Body** — unordered list (`-`), one field per line, in the order defined below
3. **One line per value** — no value spans lines, is empty, or has leading or trailing whitespace; lists inside a value are comma-separated
4. **Last field** — must always be `Next step:` for command entries (change entries are exempt — see below)
5. **Separator** — one blank line between entries, no horizontal rules
6. **Order** — newest entries appended to the bottom (chronological), not the top
7. **Append-only** — past entries are never edited, reordered, or deleted, even when a later step makes one look wrong. To revert or restore something an earlier entry recorded, append a `correction` change entry
8. **No prose** — entries are bullets only, no paragraphs

---

### Value shapes

| Field                                     | Shape                                                                                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Counts                                    | digits only, e.g. `3`                                                                                                                                    |
| `Open questions`, `Concerns`, `Proposals` | a count, or `none`                                                                                                                                       |
| `Acceptance criteria`                     | `<X> of <Y> met`                                                                                                                                         |
| `Deviations from plan`                    | `no`, or `yes — see change entries above`                                                                                                                |
| `Known issues`, `New issues found`        | `no`, or `yes — <note>`                                                                                                                                  |
| `Files touched`                           | comma-separated paths, or `none`                                                                                                                         |
| `Source`                                  | an issue id (`GH-<n>`), or `none`                                                                                                                        |
| `Mode`                                    | a fix mode from `vocabulary.md`                                                                                                                          |
| `Verdict`                                 | a verdict from `vocabulary.md` that is valid for the command                                                                                             |
| `Minor fixed`                             | a count, or `skipped — not in scope`                                                                                                                     |
| `Suggestions fixed`, `Skipped by user`    | a count, or `none`                                                                                                                                       |
| `Validation`                              | a validation result from `vocabulary.md`                                                                                                                 |
| `Gates passed`                            | `<x> of <y>`                                                                                                                                             |
| `Failed gate`                             | a gate name from **Gates** in `validation.md`, or `none`                                                                                                 |
| `Files changed`                           | comma-separated paths, or `none`                                                                                                                         |
| `Manual steps`                            | comma-separated, each item one action the user takes before the next command, such as restarting a local service or renaming a file before handing it on |

---

## `paused` and `failed` — any command

These two have the same fields whichever command wrote them.

### `/story-<command> paused`

- Blocked on (one line — what needs the user's input)
- Progress (one line — what's finished so far, or `none`)
- Files touched (comma-separated paths, or `none`)
- Next step (`answer the open questions, then re-run /story-<command> <id>`)

Written by `/story-plan` and `/story-implement` when their subagent returns `needs-input`. The user's answers follow as `decision` / `deviation` / `scope-change` change entries, and a re-run picks up from there. An answer the user can't give yet starts its `What:` with the `not-answered-yet:` marker.

### `/story-<command> failed`

- Reason (one line)
- Next step (`re-run /story-<command> <id>`, or what to fix first)

Written when a subagent returns `error` or a malformed result. No artifact is written for a failed run.

---

## `completed` — per-command fields (required, in order)

Any `completed` entry may add `Manual steps:` right before `Next step:`. Leave it out when there are none.

### `/story-spec completed`

- Feature
- Source (issue id or `none`)
- Key decisions
- Next step

### `/story-plan completed`

- Approach
- Key decisions
- Open questions (count or `none`)
- Concerns (count or `none`)
- Next step

### `/story-implement completed`

- Summary
- Files created (count)
- Files modified (count)
- Deviations from plan (`yes — see change entries above` or `no`)
- Known issues (`yes — <note>` or `no`)
- Next step

### `/story-review completed`

- Blockers (count)
- Major (count)
- Minor (count)
- Suggestions (count)
- Acceptance criteria (`X of Y met`)
- Verdict (`fix-needed` or `approved`)
- Next step (per **Review verdict** in `vocabulary.md`)

### `/story-fix completed`

- Mode (`auto`, `plan`, or `interactive`)
- Blockers fixed (count)
- Major issues fixed (count)
- Minor fixed (count, or `skipped — not in scope`)
- Suggestions fixed (count, or `none`)
- Skipped by user (count, or `none` — includes findings marked already fixed)
- New issues found (`yes — <note>` or `no`)
- Next step (per **Fix next step** in `vocabulary.md`)

### `/story-validate completed`

- Validation (`passed` or `failed`)
- Gates passed (`<x> of <y>`)
- Failed gate (gate name, or `none`)
- Next step (per **Validation next step** in `vocabulary.md`)

### `/story-retro completed`

- Proposals (count, or `none`)
- Accepted (count, `edited` proposals included)
- Rejected (count)
- Files changed (comma-separated paths, or `none`)
- Next step (`none — story complete`)

Neither `/story-validate` nor `/story-retro` writes `paused` or `failed`: a precondition that isn't met stops the command without logging.

---

## Change entries

Between command entries, the agent appends **change entries** whenever a meaningful event happens mid-session: decisions, deviations from the plan, scope changes, blockers, or corrections. They are the canonical record of in-flow events — completion entries reference them rather than restating them.

Heading uses `change` instead of `/story-<command> <status>`:

```markdown
## #<n> — <YYYY-MM-DD HH:MM:SS> — change

- Trigger: <user-request | agent-decision>
- Type: <decision | deviation | scope-change | blocker | correction>
- What: <one-line description>
- Why: <reason>
- Impact: <files, decisions, or downstream steps affected; or "none">
- Corrects: <#<n> | <timestamp> | none>
```

All fields are required, in the order shown, except `Corrects:`, which every `correction` has and no other type does: the id of the entry it corrects (its timestamp for an entry written before ids), or `none` when it corrects something done rather than something logged. The correction restates whatever in the corrected entry still holds. `Next step:` is **not** included — change entries record what happened, they don't move the workflow forward.

---

## Example

```markdown
## #1 — 2026-04-23 09:14:22 — /story-spec completed

- Feature: account creation with excluded from net worth toggle
- Source: GH-42
- Key decisions: toggle defaults to false
- Next step: /story-plan GH-42

## #2 — 2026-04-23 11:47:03 — /story-plan completed

- Approach: new boolean field on accounts table + UI toggle in form
- Key decisions: reuse existing form component
- Open questions: none
- Concerns: none
- Next step: /story-implement GH-42

## #3 — 2026-04-23 14:22:18 — /story-implement paused

- Blocked on: whether archived accounts count toward net worth
- Progress: form component and schema change written
- Files touched: src/accounts/AccountForm.tsx, db/schema/0042_archived.sql
- Next step: answer the open questions, then re-run /story-implement GH-42

## #4 — 2026-04-23 14:25:40 — change

- Trigger: user-request
- Type: scope-change
- What: archived accounts are excluded from net worth and hidden by default
- Why: resolves "should archived accounts still count toward net worth?"
- Impact: PLAN.md updated, the schema needs an `archived` column

## #5 — 2026-04-23 16:05:33 — /story-implement completed

- Summary: account creation form with excluded-from-net-worth toggle
- Files created: 3
- Files modified: 4
- Deviations from plan: yes — see change entries above
- Known issues: no
- Next step: /story-validate GH-42

## #6 — 2026-04-23 16:40:12 — change

- Trigger: user-request
- Type: correction
- What: archived accounts stay visible in the account list and are only excluded from net worth
- Why: the user wants to see archived accounts; hiding them was never intended
- Impact: src/accounts/AccountList.tsx, PLAN.md (archived accounts visible), IMPLEMENTATION-SUMMARY.md under Changes after implementation
- Corrects: #4
```
