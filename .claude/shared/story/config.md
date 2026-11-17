# Project config

The config lives at `.agents/stories/config.yml` and is committed with the repo. `/story-init` creates it.

```yaml
commands:
  fix:
    mode: plan
    include_minor: false
```

---

## Keys

| Key                          | Required | Written by    | Read by      | Meaning                                                                                             |
| ---------------------------- | -------- | ------------- | ------------ | --------------------------------------------------------------------------------------------------- |
| `commands.fix.mode`          | yes      | `/story-init` | `/story-fix` | Fix mode, one of the fix modes in [`vocabulary`](./vocabulary.md). A flag overrides it for one run. |
| `commands.fix.include_minor` | yes      | `/story-init` | `/story-fix` | Whether `/story-fix` also fixes minor findings.                                                     |

A command changes only the keys it writes, and leaves every other key exactly as it was.

## Issue tracker

The story workflow reads issues only from this repository's GitHub issues, through the `github` MCP server configured in `.mcp.json`. That server needs the `GITHUB_PAT` environment variable. There is no config key for the tracker.

---

## Required keys

A command that checks the config reads `.agents/stories/config.yml`. It stops if the file is missing, isn't valid YAML, or lacks a required key:

> "The story workflow isn't set up for this project. Run `/story-init` first."

If `commands.fix.mode` is set to anything other than a fix mode in [`vocabulary`](./vocabulary.md), or `commands.fix.include_minor` isn't `true` or `false`, stop:

> "Invalid `<key>` value `<value>` in `.agents/stories/config.yml`. Run `/story-init` to fix it."
