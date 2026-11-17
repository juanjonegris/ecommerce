# Project config

`~/.sb/sbweb/sb-ticket-artifacts/config.yml`. `/sb:ticket-init` creates it.

```yaml
commands:
  fix:
    mode: plan
    include_minor: false

tickets:
  server: claude_ai_Linear
```

---

## Keys

| Key                          | Required | Written by        | Read by           | Meaning                                                                                                                                                         |
| ---------------------------- | -------- | ----------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands.fix.mode`          | yes      | `/sb:ticket-init` | `/sb:ticket-fix`  | Fix mode, one of the fix modes in [`vocabulary`](./vocabulary.md). A flag overrides it for one run.                                                             |
| `commands.fix.include_minor` | yes      | `/sb:ticket-init` | `/sb:ticket-fix`  | Whether `/sb:ticket-fix` also fixes minor findings.                                                                                                             |
| `tickets.server`             | no       | `/sb:ticket-init` | `/sb:ticket-spec` | Full name of the MCP server that `/sb:ticket-spec <ticket-id>` fetches tickets from. Unset, `/sb:ticket-spec <ticket-id>` stops and asks for `/sb:ticket-init`. |

A command changes only the keys it writes and leaves every other key exactly as it was.

---

## Required keys

A command that checks the config reads `~/.sb/sbweb/sb-ticket-artifacts/config.yml`, resolved to its full path, and stops if the file is missing, isn't valid YAML, or lacks a required key:

> "The ticket workflow isn't set up for this project. Run `/sb:ticket-init` first."

If `commands.fix.mode` is set to anything other than a fix mode in [`vocabulary`](./vocabulary.md), or `commands.fix.include_minor` isn't `true` or `false`, stop:

> "Invalid `<key>` value `<value>` in `~/.sb/sbweb/sb-ticket-artifacts/config.yml`. Run `/sb:ticket-init` to fix it."
