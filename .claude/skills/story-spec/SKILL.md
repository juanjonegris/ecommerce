---
name: story-spec
description: 'Starts a new story: creates the story folder (GH-<n>-<slug> from a GitHub issue, <code>-<slug> otherwise) and fills SPEC.md through a one-question-at-a-time conversation, optionally pre-filled from the GitHub issue'
argument-hint: '[GH-<n> | #<n> | <issue-url>]'
disable-model-invocation: true
---

# /story-spec

Start a story and write its `SPEC.md`. If the story comes from a GitHub issue of this repository, pre-fill parts of the spec from the issue.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1, unless its full text is already in your context.

## Step 1 — Parse command arguments

Raw arguments: `$ARGUMENTS`, trimmed.

- **Empty:** a standalone story.
- **A single issue reference:** `GH-<n>`, `gh-<n>`, `#<n>` or a bare number `<n>`. This makes it an issue story, with `<n>` the issue number.
- **A single GitHub issue URL:** `https://github.com/<owner>/<repo>/issues/<n>`. This makes it an issue story, with `<n>` taken from the URL. If `<owner>/<repo>` isn't this repository (the `origin` remote, from `git remote get-url origin`), stop:
  > "That issue belongs to `<owner>/<repo>`, not to this repository (`<origin-owner>/<origin-repo>`)."
- **Anything else:** show the examples below and stop.

For an issue story, `<issue-id>` = `GH-<n>`.

Examples:

- `/story-spec`: a standalone story. The name comes from your answers.
- `/story-spec GH-12` or `/story-spec #12`: pulls context from issue #12 of this repository.
- `/story-spec https://github.com/<owner>/<repo>/issues/12`: the same, with the issue number taken from the URL.

---

## Step 2 — Check the config and fetch the issue (if any)

Check the config per **Required keys** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/config.md`.

For an issue story:

- If a folder matching `.agents/stories/GH-<n>-*` (case-insensitive) already exists, stop. Never create a second folder for the same issue:

  > "Issue `GH-<n>` already has a story at `.agents/stories/<folder>/`. Run `/story-resume GH-<n>`."

  A missing `.agents/stories/` means there's no match. If the check itself fails, stop and show its error.

- If the `github` MCP server isn't available in this session, stop:
  > "The `github` MCP server isn't available. Check `.mcp.json` and that `GITHUB_PAT` is set, then re-run `/story-spec GH-<n>`."

Otherwise, fetch issue `<n>` with the GitHub MCP server's `issue_read` tool (method `get`). Take `<owner>` and `<repo>` from the `origin` remote. Also read the issue's comments (method `get_comments`).

If the issue doesn't exist, stop:

> "Issue `#<n>` wasn't found in `<owner>/<repo>`."

Tell the user what was pulled in:

> "Loaded issue `#<n>`: <issue-title>
>
> The following spec fields will be pre-filled from the issue:
>
> - Description ← issue title
> - Problem ← issue body
> - Acceptance criteria ← the issue's acceptance criteria, or criteria derived from its body and comments, marked "derived — confirm"
>
> I'll show each one during the spec conversation so you can confirm or edit it."

---

## Step 3 — Start the spec conversation

Nothing is written to disk until every question is answered.

Tell the user:

> "Let's build out the spec together. I'll ask you a few questions to define a solid use case before we move to design."

Then ask the following questions **one at a time**, in order.

### For an issue story

For any question whose answer is pre-filled from the issue, present the pre-filled value and ask for confirmation:

> "From the issue: _<mapped value>_.
>
> Keep as-is, or rewrite?"

### Questions to ask

1. **Description**

   > "In one sentence, what is this feature?"

2. **Problem**

   > "What problem does this solve for the user?"

3. **Use case**

   > "Walk me through the user flow step by step. What does the user do, what does the app do, and what's the end result?"

4. **Acceptance criteria**

   > "How do we know this feature is done? List the conditions that must be true for it to be considered complete."

5. **References**

   > "Are there any screenshots, mockups, or other files I should put in `refs/`? If so, describe them or share them now."

6. **Out of scope**
   > "Is anything explicitly NOT part of this feature?"

---

## Step 4 — Create the folder structure

`<id>` is the story's display id, per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

### 4a. Get the id

- **Issue story:** the id is `GH-<n>`; go to 4b.
- **Standalone story:** generate `<code>` by running this in a POSIX shell:

  ```sh
  LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 4
  ```

  or this in PowerShell:

  ```powershell
  -join (1..4 | ForEach-Object { 'abcdefghijklmnopqrstuvwxyz0123456789'.ToCharArray() | Get-Random })
  ```

  If any folder in `.agents/stories/` starts with `<code>-`, run it again. Never make up a code or pick one yourself.

### 4b. Name the feature

- **Issue story:** `<feature-name>` = the issue's title.
- **Standalone story:** infer `<feature-name>` from the Description and Problem answers. It's a short phrase naming what the feature does, e.g. `user login`. Don't ask the user for it.

### 4c. Build the folder name

`<kebab>` is `<feature-name>` in kebab-case, per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`. If `<kebab>` is longer than 50 characters, cut it at the last `-` before the 50th character.

- **Issue story:** `<folder>` = `GH-<n>-<kebab>`
- **Standalone story:** `<folder>` = `<code>-<kebab>`

### 4d. Create the folder

Create this structure at `.agents/stories/<folder>/`:

```
.agents/stories/<folder>/
  LOGS.md
  SPEC.md
  refs/
```

---

## Step 5 — Write SPEC.md

Write the following to `SPEC.md`.

For an issue story, include the `Source:` line linking back to the issue. Leave it out for a standalone story.

```markdown
# SPEC — <feature-name>

> **Source:** [GH-<n>](issue-url) — <issue-title>

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

Append a `/story-spec completed` entry to `.agents/stories/<folder>/LOGS.md`, per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/logs-format.md`.

---

## Step 7 — Hand off to user

Hand off to the user per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/result-format.md`. For a standalone story, include the inferred name among the key facts, e.g. `Feature: user login`.
