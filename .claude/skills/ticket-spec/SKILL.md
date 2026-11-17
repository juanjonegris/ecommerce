---
name: ticket-spec
description: "Starts a new feature spec: creates the spec folder (<TICKET-ID>-<slug> from a ticket, <repo>-<code>-<slug> otherwise) and fills SPEC.md through a one-question-at-a-time conversation, optionally pre-filled from a ticket through the project's ticket server"
argument-hint: '[<ticket-id> | <ticket-url>]'
disable-model-invocation: true
---

# /spec

If the spec comes from a ticket (e.g. JIRA, Linear, GitHub), pre-fill parts of it through the project's ticket server.

`rules.md` is `../../shared/ticket/rules.md`. Read it before Step 1 unless its full text is already in your context.

## Step 1 — Parse command arguments

Raw arguments: `$ARGUMENTS`, trimmed.

- **Empty** → a spec without a ticket.
- **A single token shaped like a ticket id** — a letter, then letters or digits, a `-`, then digits, e.g. `PROJ-1234` → a ticket spec. `<ticket-id>` = the argument, keeping its casing.
- **A single URL naming one ticket** — a token starting with `http://` or `https://` whose whole path segments and query-parameter values contain exactly one id shaped like a ticket id (case-insensitive) → a ticket spec. `<ticket-id>` = that id, keeping its casing:
  - `https://some-org.atlassian.net/jira/software/projects/PROJ/boards/12?selectedIssue=PROJ-1234` → `PROJ-1234`
  - `https://linear.app/some-org/issue/PROJ-41/some-title` → `PROJ-41`
- **Anything else** → show the examples below and stop.

Examples:

- `/sb:ticket-spec`: plain feature, no external ticket. The name comes from your answers
- `/sb:ticket-spec PROJ-1234`: pulls context from ticket PROJ-1234 through the project's ticket server
- `/sb:ticket-spec https://some-org.atlassian.net/browse/PROJ-1234`: the same, with the ticket id taken from the URL

---

## Step 2 — Check the config and fetch the ticket (if any)

Check the config per **Required keys** in `../../shared/ticket/config.md`.

For a spec without a ticket, get `<repo>` now, per `../../shared/ticket/spec-identifiers.md`, so a missing git repository stops the command before the conversation.

For a ticket spec:

- `<server>` = `tickets.server` from `<vault>/sb-ticket-artifacts/config.yml`. If it's unset, stop:
  > "No ticket server is set for this project. Run `/sb:ticket-init` to choose one."
- If no MCP server named `<server>` is available in this session, stop, listing the MCP servers that are available:
  > "MCP server `<server>` isn't available. Available servers: <list>. Install or enable it, or run `/sb:ticket-init` to choose another."
- If a folder matching `<vault>/sb-ticket-artifacts/specs/<ticket-id>-*` (case-insensitive) already exists, stop — never create a second folder for the same ticket:

  > "Ticket `<ticket-id>` already has a spec at `<vault>/sb-ticket-artifacts/specs/<folder>/`. Run `/sb:ticket-resume <ticket-id>`."

  A missing `<vault>/sb-ticket-artifacts/specs/` means no match. If the check itself fails, stop and show its error.

Otherwise, fetch the ticket with id `<ticket-id>` using that server's MCP tools.

If the ticket doesn't exist, stop:

> "Ticket `<ticket-id>` wasn't found on `<server>`."

Report back to the user what was pulled in:

> "Loaded `<ticket-id>` ticket:
>
> The following spec fields will be pre-filled from the ticket:
>
> - Description ← ticket summary
> - Problem ← ticket description
> - Acceptance criteria ← ticket acceptance criteria
>
> I'll show each one during the spec conversation so you can confirm or edit."

---

## Step 3 — Start the spec conversation

Nothing is written to disk until every question is answered.

Tell the user:

> "Let's build out the spec together — I'll ask you a few questions to define a solid use case before moving to design."

Then ask the following questions **one at a time**, in order.

### For a ticket spec

For any question whose answer is pre-filled from the ticket, present the pre-filled value and ask for confirmation:

> "From the ticket: _<mapped value>_.
>
> Keep as-is, or rewrite?"

### Questions to ask

1. **Description**

   > "In one sentence — what is this feature?"

2. **Problem**

   > "What problem does this solve for the user?"

3. **Use case**

   > "Walk me through the user flow step by step. What does the user do, what does the app do, what's the end result?"

4. **Acceptance criteria**

   > "How do we know this feature is done? List the conditions that must be true for it to be considered complete."

5. **References**

   > "Are there any screenshots, mockups, or other files I should put in `refs/`? If so, describe them or share them now."

6. **Out of scope**
   > "Is something explicitly NOT part of this feature?"

---

## Step 4 — Create the folder structure

`<id>` is the spec's display id per `../../shared/ticket/spec-identifiers.md`.

### 4a. Get the id

- **From a ticket** — no code; go to 4b.
- **Without a ticket** — generate `<code>` by running, in a POSIX shell:

  ```sh
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 4
  ```

  or in PowerShell:

  ```powershell
  -join (1..4 | ForEach-Object { 'abcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() | Get-Random })
  ```

  If any folder in `<vault>/sb-ticket-artifacts/specs/` starts with `<repo>-<code>-`, run it again. Never make up a code or pick one yourself.

### 4b. Name the feature

- **From a ticket** — `<feature-name>` = the ticket's title.
- **Without a ticket** — infer `<feature-name>` from the Description and Problem answers: a short phrase naming what the feature does, e.g. `user login`. Don't ask the user for it.

### 4c. Build the folder name

`<kebab>` is `<feature-name>` in kebab-case, per `../../shared/ticket/spec-identifiers.md`. If `<kebab>` is longer than 50 characters, cut it at the last `-` before the 50th character.

- **From a ticket** — `<folder>` = `<ticket-id>-<kebab>`
- **Without a ticket** — `<folder>` = `<repo>-<code>-<kebab>`

### 4d. Create the folder

Create the following structure at `<vault>/sb-ticket-artifacts/specs/<folder>/`:

```
<vault>/sb-ticket-artifacts/specs/<folder>/
  LOGS.md
  SPEC.md
  refs/
```

---

## Step 5 — Write SPEC.md

Write the following to `SPEC.md`.

For a ticket spec, include the `Source:` line linking back to the ticket. Omit it for a spec without a ticket.

```markdown
# SPEC — <feature-name>

> **Source:** [<ticket-id>](ticket-url) — <ticket-title>

## Description

<one-line description>

## Problem

<why this feature matters>

## Use case

<step-by-step user flow>

## Acceptance criteria

- <criterion 1>
- <criterion 2>
- ...

## References

<list of files in refs/, or "none">

## Out of scope

- <item 1>
- <item 2>
- ...
```

---

## Step 6 — Append to LOGS.md

Append a `/spec completed` entry to `<vault>/sb-ticket-artifacts/specs/<folder>/LOGS.md` per `../../shared/ticket/logs-format.md`.

---

## Step 7 — Hand off to user

Hand off to the user per `../../shared/ticket/result-format.md`. For a spec without a ticket, include the inferred name among the key facts, e.g. `Feature: user login`.
