# Result and hand-off format

Every ticket command ends with a final report, and every report has one of two readers:

- **A dispatching command** reads a subagent's **result** and turns it into files and a `LOGS.md` entry.
- **The user** reads a command's **hand-off**.

A result maps onto its log entry field for field, and all three read the same way. Every fixed value comes from [`vocabulary.md`](./vocabulary.md).

---

## Subagent result

Returned as the subagent's final message

```
===RESULT===
- Status: <complete | needs-input | error>
- <Field>: <value>
- ...

### Questions
- [<change-type>] <question> — <why it matters>
===<ARTIFACT>.md===
<raw markdown, verbatim>
===END===
```

### Rules

1. **Nothing outside the blocks.** No preamble before `===RESULT===`, nothing after `===END===`.
2. **`Status:` is always the first bullet.**
3. **The fields after it are the `LOGS.md` fields for the entry that status produces** — `completed`, `paused`, or `failed` (see the mapping in `vocabulary.md` and the per-command fields below). Same names, same order, minus `Next step:`, which the dispatcher adds. Everything else is copied verbatim.
4. **One line per value.** No value spans lines. Lists inside a value are comma-separated.
5. **Every fixed value comes from `vocabulary.md`**, exactly as written there.
6. **`###` sections appear only when they apply** — never written empty. `### Questions` appears only with `needs-input`.
7. **Artifact blocks are named after the file they become** (`===PLAN.md===`) and appear only with `complete`. Their content is raw markdown, written verbatim.
8. **`===END===` closes every result.**

### Malformed results

A result is malformed if any rule above is broken: text outside the blocks, `Status:` missing or not first, a required field missing, a value outside its vocabulary, a missing artifact block on `complete`, a question without a valid **question tag**, or no `===END===`.

The dispatcher never guesses or patches a malformed result. It treats it exactly like `Status: error` — logs a `failed` entry with `Reason: malformed result — <what was wrong>`, writes no artifact.

### Per-command fields

| Subagent      | `complete` fields                                                          | `needs-input` fields                | Artifact block                    |
| ------------- | -------------------------------------------------------------------------- | ----------------------------------- | --------------------------------- |
| `architect`   | Approach, Key decisions, Open questions, Concerns                          | Blocked on, Progress, Files touched | `===PLAN.md===`                   |
| `implementer` | Summary, Files created, Files modified, Deviations from plan, Known issues | Blocked on, Progress, Files touched | `===IMPLEMENTATION-SUMMARY.md===` |
| `reviewer`    | Blockers, Major, Minor, Suggestions, Acceptance criteria, Verdict          | —                                   | `===REVIEW.md===`                 |

`error` always carries exactly one field: `Reason: <one line>`.

Field formats are defined in [`logs-format.md`](./logs-format.md) under each command.

### Example

```
===RESULT===
- Status: needs-input
- Blocked on: whether archived accounts count toward net worth
- Progress: form component and schema change written
- Files touched: src/accounts/AccountForm.tsx, db/schema/0042_archived.sql

### Questions
- [decision] Should archived accounts still count toward net worth? — the design hides them from the list but doesn't say whether the total excludes them.
===END===
```

## Hand-off

Every command's final message to the user:

```
/<command> <id> <status>
Artifact: `<path to the artifact the user should review>`
<one to three lines of key facts>
Next: <`/sb:ticket-<next-command> <id>`, or what the user needs to do>
```

A command's skill may name a list for its hand-off. It goes after the key facts and before `Next:`, one line per item:

```
<Label>:
- <item>
```

When the command's `completed` entry has `Manual steps:`, the hand-off lists them in the same form under `Manual steps`, last before `Next:`.
