# Ticket workflow rules

Cross-cutting rules the agent applies regardless of which command is running. These apply to **every** ticket command.

---

## Always read LOGS.md first

When working on any feature, read `LOGS.md` in the relevant spec folder before doing anything else. It is the single source of truth for current state — what's been done, what was decided, what's next. Never skip it, even when "just looking" at one specific file. An entry named by a later `Corrects:` is superseded: go by the correction, not the entry.

---

## Stop and ask, one question at a time

If anything in the spec or plan is ambiguous, contradictory, or underspecified, stop and ask the user a targeted question before proceeding. Ask one question at a time when there are several. Do not guess to keep momentum — guessing accumulates into deviations that surface much later.

Don't ask what the repo answers. Before asking how something should behave, find how the closest existing equivalent in the codebase does it. When a question offers options, recommend that existing pattern, cited as `<file>:<line>`, unless there's a reason not to, and if so say what it is. If a recommendation rests only on how the code does it, flag it, so the user knows to apply product judgement.

When the user questions a design, check the code before defending it.

If everything is clear, skip the clarifying step entirely and proceed.

---

## Steps the user does in a tool

When the user makes a change themselves in a tool, give the target state as checks they can see. Then verify it against what the tool produced (its files, or a value the user reads back), never against their "done".

---

## Wait for the user

Never continue into the next command's work. Hand off and wait for the user to run it.

---

## Artifact ownership

- **Living: `SPEC.md`, `PLAN.md`.** They state what should be true now. An edit rewrites the affected sections and never narrates what they replaced. A decision may cite the change entry behind it (`LOGS.md #<n>`). Every edit has a change entry whose `Impact:` names the file and the sections updated (the step's own change entry counts). Once one of `PLAN.md`'s **Open questions** is answered, remove it from there (write `none` once it's empty).
- **Who updates living artifacts.** Any step that makes the work contradict `SPEC.md` or `PLAN.md` updates it in that step. A `scope-change` updates `SPEC.md`, and `PLAN.md` if it exists.
- **Records: `IMPLEMENTATION-SUMMARY.md`, `REVIEW.md`.** `/implement` writes `IMPLEMENTATION-SUMMARY.md` and `/review` writes `REVIEW.md` on each pass; other commands only append to them. `/fix` appending its Fix Summary to `REVIEW.md` is such an append. `/fix` and changes between commands add each file they touch to `IMPLEMENTATION-SUMMARY.md` under **Changes after implementation** (replacing its `None`) as ``- `<path>` — <what changed> (<source>)``, where `<source>` is `see change entry #<n>` or `fix <codes>`.

---

## Changes between commands

Outside `/implement` and `/fix`, don't edit source files on your own. When the user asks for a change between commands:

- **A change that needs planning** (a design decision, a change to the plan's architecture, work across many files), or any change before `IMPLEMENTATION-SUMMARY.md` exists: update `SPEC.md` or `PLAN.md` per **Artifact ownership**, and hand off to `/story-plan <id>` if there's no `PLAN.md` yet, otherwise to `/story-implement <id>`.
- **Any other change**: make it in this session, update `SPEC.md` or `PLAN.md` per **Artifact ownership** if the change contradicts them, and log a change entry. Add each file it touches to `IMPLEMENTATION-SUMMARY.md` per **Artifact ownership**, citing that entry, then hand off to `/story-review <id>`.

---

## Logging discipline

While working on any spec, append **change entries** to the corresponding `LOGS.md` whenever a meaningful event happens mid-session — not just when a command completes.

### When to log

Log a change entry, without asking, whenever an event matches a change type in [`vocabulary`](./vocabulary.md).

### When NOT to log

Routine work creates noise — do not log it:

- Reading files, running searches, asking the next clarifying question in a normal flow
- Fixing typos, formatting, or reformatting code
- Restating something already captured in a command's completion entry
- Internal reasoning steps that don't change anything
- Reading `LOGS.md`; only log if what it surfaced changed a decision (and then log the decision, not the lookup)

---

## Reports and vocabulary

Every fixed value in the ticket workflow — command statuses, result statuses, change types and triggers, severities, verdicts, fix modes — is defined once, in [`vocabulary`](./vocabulary.md). Commands use those values exactly; a value that isn't on its list is an error, never something to coerce.

Every final report follows [`the result format`](./result-format.md), in markdown.

`LOGS.md` entries, results, and hand-offs share the same field names, so information moves between them by copying, not translating.

---

## Path conventions

Two roots, never mixed.

**Plugin files** ship with the `sb` plugin (devin-config), relative to the plugin root:

| Location                  | Purpose                                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/story/rules.md`   | This file                                                                                                                                                   |
| `shared/story/`           | `vocabulary.md`, `result-format.md`, `logs-format.md`, `config.md`, `story-identifiers.md`, `delegated-work.md`, `project-standards.md`, `project-hooks.md` |
| `skills/story-<command>/` | One skill per command, invoked as `/story-<command>`                                                                                                        |
| `agents/`                 | Subagents, dispatched as `story-architect`, `story-implementer`, `story-reviewer`. See [`delegated work`](./delegated-work.md)                              |

**Project files** are the work product, in the developer's vault (rule `sb-vault`), outside every repo:

| Location                                                                       | Purpose                                                                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `.agents/stories/config.yml`                                                   | Project config, created by `/story-init`. Every key is documented in [`config`](./config.md) |
| `.agents/stories/<TICKET-ID>-<slug>/`, `.agents/stories/<repo>-<code>-<slug>/` | Per-feature work product (created by `/story-spec`)                                          |

`<vault>` is `~/.sb/sbweb/` resolved to its full path with the shell (PowerShell `$env:USERPROFILE\.sb\sbweb`, POSIX `$HOME/.sb/sbweb`). Always read and write project files through that full path.
