# Project standards

Find the target project's standards: every file in it that documents how code should be written or how the product should behave — docs, and the instructions the project gives any coding agent (`CLAUDE.md`, `AGENTS.md`, rules, skills, including the skills of the plugins the project enables). Read the parts relevant to the feature, and cite a standard as `<file>:<line>`. Invoke a skill that applies; read it as a file when it can't be invoked, and follow it only as far as your own job allows.

The project's hook config is a standard too: `.claude/settings.json`, `.claude/settings.local.json`, the hooks of the plugins the project enables, and `hooks` in the frontmatter of the project's skills and agents. When a hook's matcher covers a tool call the feature needs, read its script to learn what it blocks.

## Recorded knowledge

The project may also record what it learned the hard way: post-mortems, lessons files, KB entries, known traps, non-obvious facts. It may keep that in files or in a server. Read only the files; never query an MCP server for it, the ticket server included. If the project points to knowledge kept in a server, the architect reports it in **Concerns** and the reviewer in the review Summary.

The project points to recorded knowledge when an instruction file or skill above names where it lives or indexes it. Use every source it points to. A path it points to that doesn't exist is reported the same way. Look for docs that hold it only when the project points nowhere.

Search those files for the paths, components and features the change touches, and read only the matches.

Recorded knowledge is evidence, not a standard: the code an entry describes may since have changed. Before acting on an entry, check that it still applies to the current code, and cite it as `<file>:<line>`.
