---
name: story-init
description: 'Creates the story workflow config at .agents/stories/config.yml with the /story-fix defaults.'
disable-model-invocation: true
---

# /story-init

Configure the story workflow for this project.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1, unless its full text is already in your context.

## Step 1 — Read the current config

Read `.agents/stories/config.yml`.

- **Missing:** start from an empty config.
- **Present:** start from it.
- **Not valid YAML:** stop:
  > "`.agents/stories/config.yml` isn't valid YAML. Fix it by hand, then re-run `/story-init`."

## Step 2 — Ask

For each question, show the current value when it's set. An empty reply keeps the current value. When the value is unset, an empty reply takes the recommended answer.

1. **Fix mode**

   > "How should `/story-fix` apply review findings? A flag overrides this for one run."

   Ask with the `AskUserQuestion` tool. Offer each value in **Fix mode** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md` with its behavior, and put `plan` first, marked as recommended.

2. **Include minor**

   > "Should `/story-fix` also fix minor findings? (yes / no — recommended no)"

The tracker isn't configurable: the workflow reads GitHub issues through the `github` MCP server. See **Issue tracker** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/config.md`.

## Step 3 — Write the config

Write `.agents/stories/config.yml`, creating `.agents/stories/` if it doesn't exist:

```yaml
commands:
  fix:
    mode: <auto | plan | interactive>
    include_minor: <true | false>
```

Change only `commands.fix.mode` and `commands.fix.include_minor`. Leave every other key as it was.

## Step 4 — Hand off to user

```
/story-init completed
Artifact: `.agents/stories/config.yml`
fix: mode <mode>, include_minor <true | false>
Next: /story-spec, or /story-spec GH-<n>
```
