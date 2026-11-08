---
name: rules-check-drift
description: Check whether CLAUDE.md and the path-scoped rules in .claude/rules/ still match the codebase after recent changes. Reports now-false rules, drifted map entries, dead `paths` globs, and any new invariant worth adding, each with the minimal edit. Advisory and anti-bloat. Run from /validate or before a merge.
argument-hint: '[optional diff range, e.g. main...HEAD]'
---

# Rules drift check

The rules harness is a steering document, not documentation. Its only failure that matters is being **wrong**: a stale rule or a glob that no longer matches anything misleads the agent on every future run. Wrong rules are worse than missing rules; a longer rule file is worse than a lean one.

## Scope

- Root `CLAUDE.md`, `apps/web/CLAUDE.md` (and the `AGENTS.md` it imports), every `.claude/rules/**/*.md`.
- Not README, not `.claude/archive/`, not plans, commands, or skills.

## Process

1. **What changed** — `git diff <range>` + `git status`. Default range: `git diff HEAD`; if empty, `main...HEAD`. Note moved/renamed/removed files, new modules, changed conventions, changed scripts or versions in `package.json` files.
2. **Dead globs** — for each rule file, read its `paths` frontmatter and check every pattern matches at least one tracked file (use the Glob tool). A pattern that matches nothing means the rule silently never loads.
3. **Now-false claims** — hold each rule that the change set touches against the code: file paths and reference files cited (`products.service.ts`, `lib/api.ts`, …), script names, commands, versions, layer rules.
4. **Misplaced rules** — a rule in root that only matters to one area (move to the matching `.claude/rules/` file), or a rule duplicated across files (keep one).
5. **New durable invariant** — only if the change establishes a rule that must hold going forward. One line, in the narrowest file whose `paths` cover it.

Do not suggest edits that record that a feature was added, restate what the code makes obvious, or paste code. Reference files instead.

## Output

```
## Rules drift check — range: <range>

### Fix (now false)
| File | What's wrong | Minimal fix |

### Dead globs
| Rule file | Pattern | Suggested pattern |

### Move / dedupe
- <rule> — from <file> to <file>

### Add (new invariant only)
- <one-line rule> → <file> — established by <change>
```

If nothing drifted: **"Rules are still accurate for these changes — no edits needed."**

Advisory only: apply edits only if the caller explicitly asks.
