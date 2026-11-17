---
name: story-init
description: "Creates the project's ticket workflow config at .agents/stories/config.yml: fix defaults and the ticket server."
disable-model-invocation: true
---

# /init

Configure the ticket workflow for this project.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

## Step 1 — Read the current config

Read `.agents/stories/config.yml`.

- **Missing** → start from an empty config.
- **Present** → start from it.
- **Not valid YAML** → stop:
  > "`.agents/stories/config.yml` isn't valid YAML. Fix it by hand, then re-run `/story-init`."

## Step 2 — Ask

For each question, show the current value when set. An empty reply keeps it. When it's unset, an empty reply takes the recommended answer, or `no` for question 3.

1. **Fix mode**

   > "How should `/story-fix` apply review findings? A flag overrides this for one run."

   List each value in **Fix mode** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md` with its behavior, and mark `plan` as recommended.

2. **Include minor**

   > "Should `/story-fix` also fix minor findings? (yes / no — recommended no)"

3. **Ticket server**

   > "Do you pull tickets from a tracker through an MCP server (e.g. Linear, JIRA, GitHub)? If so, which one? (e.g. `linear` — or `no`)"

   Unless the answer is `no`, find the MCP servers available in this session whose name contains the answer, case-insensitive (e.g. `linear` matches `claude_ai_Linear`):
   - **Exactly one** → `<server>` = its full name. Tell the user which server was found.
   - **More than one** → list them and ask which one to use.
   - **None** → list the available servers and ask which one to use. If there are none, or the user picks none, tell them to install or enable the server and re-run `/story-init`, and leave `tickets.server` unset.

## Step 3 — Write the config

Write `.agents/stories/config.yml`, creating `.agents/stories/` if it doesn't exist:

```yaml
commands:
  fix:
    mode: <auto | plan | interactive>
    include_minor: <true | false>

tickets:
  server: <server>
```

- Change only `commands.fix.mode`, `commands.fix.include_minor`, and `tickets.server`. Leave every other key as it was.
- Omit `tickets` if there's no ticket server.

## Step 4 — Hand off to user

```
/init completed
Artifact: `.agents/stories/config.yml`
fix: mode <mode>, include_minor <true | false>
ticket server: <server> | none
Next: /story-spec, or /story-spec <ticket-id>
```
