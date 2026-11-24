# Imported ticket-workflow harness — analysis report

Date: 2026-11-16 · Scope: uncommitted changes on `main` · Mode: read-only (this report is the only file written)

Related issue: [juanjonegris/ecommerce#1](https://github.com/juanjonegris/ecommerce/issues/1) — "Migrate new workflow with skills and subagents".

Notation: **[verified]** = read in a file or doc and cited. **[assumption]** = inferred, not confirmed.

---

## 1. Executive summary

The pasted files are the **ticket workflow** from the `sb` plugin (SmartBorder / "SBWeb" harness, repo `devin-config` / SBWebAI). It is a spec-driven, artifact-centred development loop for one feature at a time:

`/ticket-init` (once) → `/ticket-spec` → `/ticket-plan` → `/ticket-implement` → `/ticket-review` → `/ticket-fix` (repeat review/fix) — with `/ticket-resume` to pick up in a new session.

Its core ideas:

- **Every feature gets a folder of Markdown artifacts** (`SPEC.md`, `PLAN.md`, `IMPLEMENTATION-SUMMARY.md`, `REVIEW.md`) plus an **append-only `LOGS.md`** that is the single source of truth for state, decisions and resumption.
- **Heavy work runs in isolated subagents** (architect, implementer, reviewer) that receive *only* a folder path, read everything from disk, and return a strictly formatted result. The main session is a thin dispatcher that writes artifacts, logs, and relays questions to the user.
- **No guessing**: ambiguity becomes structured questions; every answer becomes a logged decision.

The files are in locations Claude Code discovers, and the frontmatter is valid. But the content is **still wired to the original environment**: `/sb:` command and `sb:` subagent names, a `~/.sb/sbweb/` vault outside the repo, a Devin-only `exec` tool, Linear/Jira-shaped ticket ids. **As-is, `/ticket-plan`, `/ticket-implement` and `/ticket-review` would fail to dispatch their subagents, and `/ticket-spec <GitHub issue URL>` would reject the input.** About a day of mechanical adaptation plus a few design decisions (Section 6) makes it functional.

---

## 2. Inventory

`git status --porcelain --untracked-files=all` and `git diff --stat HEAD` show 2 tracked changes and 20 untracked files.

### Tracked changes

| File | Change | Purpose |
|---|---|---|
| `.claude/settings.local.json` | Staged **deletion** (removed from git index; file still on disk) | Personal permission allow-list; now untracked |
| `.gitignore` | +1 line `.claude/settings.local.json` | Keeps the local settings file out of git |

### Skills — `.claude/skills/ticket-*/SKILL.md` (7)

| Skill | Lines | One-line purpose |
|---|---|---|
| `ticket-init` | 68 | Writes the workflow config (`config.yml`): fix mode, include-minor, ticket MCP server |
| `ticket-spec` | 193 | Creates the spec folder and fills `SPEC.md` through a one-question-at-a-time interview, optionally pre-filled from a ticket |
| `ticket-plan` | 43 | Thin dispatcher → `ticket-architect`; writes `PLAN.md` |
| `ticket-implement` | 42 | Thin dispatcher → `ticket-implementer`; writes `IMPLEMENTATION-SUMMARY.md` |
| `ticket-review` | 40 | Thin dispatcher → `ticket-reviewer`; writes `REVIEW.md` with coded findings |
| `ticket-fix` | 212 | Applies review findings in the main session (auto / plan / interactive), appends a Fix Summary |
| `ticket-resume` | 79 | Reads `LOGS.md` only and prints "last entry / where you are" |

### Subagents — `.claude/agents/` (3)

| Subagent | Lines | One-line purpose |
|---|---|---|
| `ticket-architect.md` | 154 | Explores the codebase and returns `PLAN.md` or blocking questions |
| `ticket-implementer.md` | 127 | Writes code per `PLAN.md`; returns `IMPLEMENTATION-SUMMARY.md` or blocking questions |
| `ticket-reviewer.md` | 125 | Independent review vs `SPEC.md`, `PLAN.md`, project standards; returns `REVIEW.md` |

### Rule / workflow files — `.claude/shared/ticket/` (9)

| File | Lines | One-line purpose |
|---|---|---|
| `rules.md` | 103 | Cross-cutting rules: read LOGS first, stop-and-ask, wait for user, artifact ownership, logging discipline, path conventions |
| `vocabulary.md` | 130 | Every fixed value: statuses, change types, severities (B/M/N/S), verdicts, fix modes |
| `logs-format.md` | 195 | Strict schema for `LOGS.md` entries (command and change entries) |
| `result-format.md` | 88 | Subagent `===RESULT===` envelope and the user hand-off format |
| `delegated-work.md` | 23 | Dispatcher ↔ subagent protocol, including the question loop |
| `spec-identifiers.md` | 80 | Spec folder naming, id resolution, branch detection / switching / creation |
| `config.md` | 37 | `config.yml` keys and validation |
| `project-standards.md` | 15 | How subagents discover the host project's standards (CLAUDE.md, rules, skills, hooks, "recorded knowledge") |
| `project-hooks.md` | 25 | How to behave when a hook blocks a tool call |

### Configuration / other

| File | Purpose |
|---|---|
| `.mcp.json` | Project MCP server `github` (HTTP, `https://api.githubcopilot.com/mcp/`, `Authorization: Bearer ${GITHUB_PAT}`) — the intended ticket server |

### Directory map

```
.mcp.json                         ← new: GitHub MCP server
.claude/
  agents/            ← new  (3 subagents)          Claude Code convention
  shared/ticket/     ← new  (9 workflow rule docs)  custom, not a Claude Code convention
  skills/ticket-*/   ← new  (7 skills)             Claude Code convention
  skills/{new-api-module,prime-codebase,rules-check-drift,schema-migration}/   existing
  commands/          existing: planning, execute, validate, commit, check-ignore-comments
  rules/             existing: path-scoped project rules
  hooks/guard-commands.mjs, settings.json      existing
  settings.local.json  (now untracked)
```

---

## 3. Intent and architecture

### 3.1 Design intent

These intentions are stated in the files:

1. **State on disk, not in the chat.** `LOGS.md` is "the single source of truth for current state" (`.claude/shared/ticket/rules.md:9`). Any session, and any subagent, can rebuild context from files. That is what makes `/ticket-resume` and the subagent isolation possible.
2. **Fresh, isolated contexts for the heavy work.** "The prompt is the folder path and the plugin root, nothing else" (`delegated-work.md:3`). The reviewer is isolated on purpose: "you're a second, independent set of eyes" (`agents/ticket-reviewer.md:9`), and it treats the implementer's summary "as claims, not facts" (`ticket-reviewer.md:26`).
3. **Never guess.** Ambiguity becomes questions (`rules.md:13-21`). Subagents can't talk to the user, so they return `needs-input`. The dispatcher asks the user, logs each answer as a `decision` / `deviation` / `scope-change`, and re-dispatches (`delegated-work.md:6-13`).
4. **Machine-checkable contracts.** Results use a rigid envelope (`result-format.md:16-27`). A result that breaks the format counts as `error` and is never patched (`result-format.md:44`). All enum values live in one file (`vocabulary.md`).
5. **The plan is the centre of gravity.** The architect must ground every reuse claim in a `file:line` and the body line that shows the side effect (`ticket-architect.md:37,106`). It separates blocking questions from Open questions and Concerns (`:42-53`), and every question must offer options, a recommendation and the tradeoff (`:55-61`). The implementer must have a logged decision for every Open question before writing code (`ticket-implementer.md:47`). This lines up with issue #1's "strong accent in the plan document and process".
6. **The project's own standards are the yardstick.** Subagents discover `CLAUDE.md`, rules, skills, hooks and "recorded knowledge" in the host repo (`project-standards.md`). The workflow is therefore project-agnostic. In this repo it would pick up `CLAUDE.md` and `.claude/rules/**`.
7. **Human pacing.** "Never continue into the next command's work. Hand off and wait" (`rules.md:33`). Every command ends with a fixed hand-off that names the next command.

### 3.2 End-to-end flow

```
            ┌───────────────┐
 (once) ──▶ │ /ticket-init  │──▶ <vault>/sb-ticket-artifacts/config.yml
            └───────────────┘
                    │
            ┌───────────────┐  ticket id/URL? → fetch via MCP server (config: tickets.server)
 user ────▶ │ /ticket-spec  │  6 questions, one at a time → creates spec folder
            └───────┬───────┘  SPEC.md, LOGS.md (#1 /spec completed), refs/
                    ▼
            ┌───────────────┐  prompt = folder path + plugin root   ┌──────────────────┐
            │ /ticket-plan  │ ─────────────────────────────────────▶ │ ticket-architect │ read-only exploration
            │ (dispatcher)  │ ◀── ===RESULT=== complete | needs-input └──────────────────┘
            └───────┬───────┘  writes PLAN.md, logs; relays questions → re-dispatch
                    ▼
            ┌──────────────────┐                                    ┌────────────────────┐
            │ /ticket-implement│ ──────────────────────────────────▶ │ ticket-implementer │ writes code, never commits
            └───────┬──────────┘ ◀── IMPLEMENTATION-SUMMARY.md / Qs  └────────────────────┘
                    ▼
            ┌───────────────┐                                       ┌─────────────────┐
            │ /ticket-review│ ─────────────────────────────────────▶ │ ticket-reviewer │ diff vs origin/HEAD, standards
            └───────┬───────┘ ◀── REVIEW.md (B/M/N/S + verdict)      └─────────────────┘
                    ▼
     verdict fix-needed ──▶ /ticket-fix (main session; auto|plan|interactive) ──▶ /ticket-review …
     verdict approved   ──▶ done (optional /ticket-fix <minor codes>)

 any time, new session ──▶ /ticket-resume  (reads LOGS.md only → "Last entry / Where you are")
```

Hand-off mechanics:

- **Skill → subagent:** the skill invokes the subagent with a two-line prompt (`ticket-plan/SKILL.md:28-33`).
- **Subagent → skill:** the subagent's final message is the `===RESULT===…===END===` block. The skill validates it, writes the artifact verbatim, and appends a `LOGS.md` entry (`delegated-work.md:15-23`).
- **Skill → user:** a fixed hand-off: `/<command> <id> <status>`, `Artifact:`, key facts, `Next:` (`result-format.md:71-89`).
- **Session → session:** `LOGS.md`. `/ticket-resume` derives "where you are" from the last command entry's `Next step:` (`ticket-resume/SKILL.md:66-80`).

Where the rules apply:

- Every skill begins with "Read `rules.md` … before Step 1" (e.g. `ticket-spec/SKILL.md:12`).
- Every subagent reads `<plugin-root>/shared/ticket/project-standards.md`, `result-format.md` and `vocabulary.md`.
- `logs-format.md` governs every write to `LOGS.md`. Ids and timestamps must come from the shell, never from memory (`logs-format.md:22-34`).

### 3.3 Component roles and dependencies

| Component | Trigger / description | Tools declared | Reads / references | Invokes |
|---|---|---|---|---|
| `ticket-init` | user-only (`disable-model-invocation: true`) | none (inherits) | `rules.md`, `vocabulary.md` (fix modes), session MCP server list | — |
| `ticket-spec` | user-only; arg `[<ticket-id> \| <ticket-url>]` | none | `rules.md`, `config.md`, `spec-identifiers.md`, `logs-format.md`, `result-format.md`; MCP ticket server | ticket MCP tools |
| `ticket-plan` | user-only; `[<spec-id>]` | none | `rules.md`, `spec-identifiers.md`, `delegated-work.md` | subagent `sb:ticket-architect` |
| `ticket-implement` | user-only; `[<spec-id>]` | none | same as above | subagent `sb:ticket-implementer` |
| `ticket-review` | user-only; `[<spec-id>]` | none | same as above, `vocabulary.md` (verdict) | subagent `sb:ticket-reviewer` |
| `ticket-fix` | user-only; `[<spec-id>] [codes…] [-a\|-p\|-i]` | none | `rules.md`, `config.md`, `vocabulary.md`, `spec-identifiers.md`, `project-standards.md`, `project-hooks.md`, `logs-format.md`, `result-format.md` | — (edits code itself) |
| `ticket-resume` | user-only; `[<spec-id>]` | none | `rules.md`, `spec-identifiers.md`, `vocabulary.md`; `LOGS.md` only | — |
| `ticket-architect` | "Produces the technical plan for a spec…" | `Read, Grep, Glob, Bash, exec, Skill` | spec folder; `project-standards.md`; `result-format.md` | may invoke project skills |
| `ticket-implementer` | "Implements a spec's PLAN.md… Invoked internally by implement." | `Read, Grep, Glob, Edit, Write, Bash, exec, Skill` | spec folder; `project-standards.md`; `project-hooks.md`; `result-format.md` | may invoke project skills |
| `ticket-reviewer` | "Reviews an implemented spec… Invoked internally by /review." | `Read, Grep, Glob, Bash, exec, Skill` | spec folder; `project-standards.md`; `vocabulary.md`; `result-format.md`; git diff vs `origin/HEAD` | may invoke project skills |

Artifacts per spec folder (`<vault>/sb-ticket-artifacts/specs/<folder>/`):

| File | Kind | Written by |
|---|---|---|
| `SPEC.md` | living (rewritten to "what's true now") | `/ticket-spec`; updated on scope changes |
| `PLAN.md` | living | `/ticket-plan`; updated on decisions |
| `IMPLEMENTATION-SUMMARY.md` | record (append "Changes after implementation") | `/ticket-implement`, then `/ticket-fix` |
| `REVIEW.md` | record (Fix Summary appended) | `/ticket-review`, then `/ticket-fix` |
| `LOGS.md` | append-only history | every command and every change event |
| `refs/` | inputs | user and architect |

---

## 4. The `shared` folder

### Contents and use

`.claude/shared/ticket/` holds the 9 workflow rule documents listed in Section 2. Nothing loads them automatically. They are reached only by **explicit relative references**:

- Skills: `../../shared/ticket/<file>.md`, resolved from the skill's own directory (e.g. `ticket-plan/SKILL.md:12,14,18,39`).
- Subagents: `<plugin-root>/shared/ticket/<file>.md`. The dispatcher computes `<plugin-root>` as "the absolute path of `../..`, resolved from the dispatching skill's directory" (`delegated-work.md:4`).
- Shared files link to each other as siblings (`./vocabulary.md` etc.).

`rules.md:87-94` states the original layout: "**Plugin files** ship with the `sb` plugin (devin-config), relative to the plugin root: `shared/ticket/rules.md` … `skills/ticket-<command>/` … `agents/`".

**Side effect of the paste [verified by path arithmetic]:** in a plugin, `skills/ticket-x/../..` is the plugin root. In this repo, `.claude/skills/ticket-x/../..` is `.claude/`, and `.claude/shared/ticket/` exists. So the relative references still resolve. The `.claude/` folder happens to mirror the plugin's layout.

### Is `shared` reserved by Claude Code?

**Conclusion: No. `shared` is an arbitrary name chosen by the plugin authors.** Claude Code does not discover, auto-load or give special behaviour to `.claude/shared/` (or to a plugin's `shared/`).

Evidence (official docs, fetched 2026-11-16):

- *Explore the .claude directory* (https://code.claude.com/docs/en/claude-directory) lists every project file and folder Claude Code reads: `CLAUDE.md`, `.mcp.json`, `.worktreeinclude`, `.claude/settings.json`, `settings.local.json`, `rules/`, `skills/`, `commands/`, `output-styles/`, `agents/`, `workflows/`, `agent-memory/`. `shared/` is not among them.
- *Plugin manifest reference → Standard layout* (https://code.claude.com/docs/en/plugins-reference) lists the plugin defaults: `.claude-plugin/plugin.json`, `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `themes/`, `monitors/`, `bin/`. `shared/` is not among them. The doc's own example layout adds an arbitrary `scripts/` folder "that its hooks call", which shows that plugins may carry extra folders of their own.
- *Skills* (https://code.claude.com/docs/en/skills): no `shared` directory is described. The only reserved folder name it mentions is `synced` (for claude.ai skills). Supporting files are meant to live *inside* the skill folder, or be referenced with `${CLAUDE_SKILL_DIR}`.
- *Memory* (https://code.claude.com/docs/en/memory): "shared" appears only as an example symlink *name* inside rules (`ln -s ~/shared-claude-rules .claude/rules/shared`). That is a rules subfolder, not a reserved directory.
- **[assumption]** The docs don't state explicitly that unknown folders under `.claude/` are ignored. Because no doc lists `shared/`, I infer it is inert until a skill or agent reads it on purpose.

### Other names used

| Path / name | Status | Source |
|---|---|---|
| `.claude/skills/<name>/SKILL.md` | **Claude Code convention** (project skills) | skills doc, "Choose where skills load" |
| `.claude/agents/*.md` | **Claude Code convention** (project subagents; priority 3) | sub-agents doc, discovery table |
| `.claude/commands/*.md` | Claude Code convention (legacy; a skill of the same name wins) | skills doc: "Custom commands have been merged into skills" |
| `.claude/rules/**/*.md` + `paths:` | Claude Code convention | memory doc, "Organize rules with .claude/rules/" |
| `.claude/settings.json`, `settings.local.json` | Claude Code convention | claude-directory doc |
| `CLAUDE.md`, `AGENTS.md` | Claude Code convention | memory doc |
| `.mcp.json` (repo root) | Claude Code convention (project MCP) | claude-directory doc |
| `.claude/shared/` | **custom** | not in any doc above |
| `.claude/hooks/` | **custom** folder name; scripts become active only because `settings.json` points to them | `.claude/settings.json` |
| `.claude/plans/`, `.claude/reports/`, `.claude/archive/` | **custom** | used by this repo's own commands (`commands/planning.md:22`, `commands/check-ignore-comments.md:26`) |
| `SPEC.md`, `PLAN.md`, `LOGS.md`, `IMPLEMENTATION-SUMMARY.md`, `REVIEW.md`, `refs/`, `config.yml` | **custom** workflow artifacts | `shared/ticket/rules.md:96-101` |
| Frontmatter `name`, `description`, `argument-hint`, `disable-model-invocation` (skills) | **valid** skill fields | skills doc, frontmatter reference |
| Frontmatter `name`, `description`, `tools` (agents) | **valid** subagent fields | sub-agents doc, supported frontmatter fields |
| `$ARGUMENTS`, `$ARGUMENTS[0]` | **valid** substitutions | skills doc, "Arguments" |

---

## 5. Functional readiness assessment

Severity: **Blocker** (the workflow fails) · **High** (wrong behaviour or a big risk) · **Medium** (friction or misleading) · **Low** (cosmetic).

### 5.1 Discovery and structure

| # | Finding | Severity | Evidence |
|---|---|---|---|
| D1 | Skills and agents sit where Claude Code discovers them. All 7 skills are already listed in this session as user-invocable. | OK | `.claude/skills/ticket-*/SKILL.md`, `.claude/agents/*.md` |
| D2 | Skill frontmatter is valid. `disable-model-invocation: true` makes all 7 user-only (`/ticket-plan`, not auto-triggered). That fits a human-paced workflow. | OK | skills doc |
| D3 | Agent frontmatter is valid (`name`, `description`, `tools`). No `model` is set, so agents inherit the session model. | OK | sub-agents doc |
| D4 | Commands are invoked as `/ticket-spec` etc. in a project, but the text everywhere says `/sb:ticket-*` (78 matches across 14 files for `sb:`/`sbweb`/`Linear`/`PROJ-`/`exec`). Hand-offs and `Next step:` lines would tell the user to run commands that don't exist. | High | e.g. `ticket-plan/SKILL.md:41`, `vocabulary.md:113-123`, `logs-format.md:74,80` |

### 5.2 Broken or stale references

| # | Finding | Severity | Evidence |
|---|---|---|---|
| R1 | **Subagent names don't match.** Dispatchers invoke `sb:ticket-architect`, `sb:ticket-implementer`, `sb:ticket-reviewer`, but project agents register as `ticket-architect` etc. Plugin agents are namespaced `plugin:agent`, and a `name` "can't contain `:`". Dispatch fails or picks the wrong agent. | **Blocker** | `ticket-plan/SKILL.md:28`, `ticket-implement/SKILL.md:28`, `ticket-review/SKILL.md:28`; sub-agents doc (frontmatter `name`; plugin naming) |
| R2 | **`exec` in agent `tools`** is Devin's shell tool, not a Claude Code tool. **[verified]** The sb plugin README lists "Devin's `read`, `exec`". The docs say that when *nothing* in `tools` resolves, the agent is refused. What happens with one unknown entry is not documented **[assumption: probably ignored, possibly an error]**. | High | `agents/ticket-*.md:4`; sb README line 175; sub-agents doc §tools |
| R3 | **Vault outside the repo:** `~/.sb/sbweb/sb-ticket-artifacts/`. That is your *work* (SmartBorder) vault. Ecommerce specs would mix with work documents. Writes there go outside the working directory (permission prompts). Today they only pass silently because the user-scope `sb` plugin's `vault-approve.ps1` hook auto-approves writes under `~/.sb/sbweb/`. That hidden coupling to the work plugin is fragile. | **Blocker** (design decision needed) | `rules.md:96-103`, `config.md:3`; `~/.claude/plugins/cache/sbwebai/sb/<ver>/hooks/vault-approve.ps1`; `~/.claude/settings.json` `enabledPlugins: sb@sbwebai: true` |
| R4 | **Rule `sb-vault`** is cited as authority (`rules.md:96`) but lives only in the sb plugin. This repo has no such rule. | Medium | `rules.md:96` |
| R5 | **Ticket id grammar excludes GitHub.** Accepted shapes are `PROJ-1234` (letter, letters/digits, `-`, digits) or a URL containing exactly one such id. `https://github.com/juanjonegris/ecommerce/issues/1` and `#1` are rejected. That blocks issue-driven specs, which is your main use (issue #1). | **Blocker** for ticket specs | `ticket-spec/SKILL.md:18-23`; `spec-identifiers.md:5` |
| R6 | Ticket field mapping assumes Jira/Linear fields ("ticket acceptance criteria"). GitHub issues have only title, body, labels, comments. | Medium | `ticket-spec/SKILL.md:59-63` |
| R7 | Default/example ticket server `claude_ai_Linear`. Here the server is `github` (`.mcp.json`), and `/ticket-init` would find it by substring. | Low | `config.md:12`, `ticket-init/SKILL.md:35-41` |
| R8 | "Plugin root" wording. It still resolves correctly here (Section 4), but `<plugin-root>` = `.claude/` is confusing. Skills rely on the model knowing its skill directory. The docs offer `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PROJECT_DIR}`, which substitute an absolute path reliably. | Medium | `delegated-work.md:4`; skills doc §variables |
| R9 | `ticket-init` description and messages mention `<vault>`. Headings say `# /init`, `# /plan`, `# /review`, which echo the built-in `/init` and `/review` names. Cosmetic, but a source of confusion in logs (`/plan completed`). | Low | `ticket-init/SKILL.md:3,7` |
| R10 | Docs and examples cite `src/accounts/AccountForm.tsx`, `db/schema/0042_archived.sql`, `PROJ-42`. These are illustrative only. | Low | `logs-format.md:155-196`, `result-format.md:61-69` |

### 5.3 Dependencies and environment

| # | Dependency | Status | Evidence |
|---|---|---|---|
| E1 | **GitHub MCP server**: `.mcp.json` needs env var `GITHUB_PAT`. It is enabled locally (`enabledMcpjsonServers: ["github"]`) and **works**: this session read issue #1 through `mcp__github__issue_read`. On another machine, or for a forked client repo, the PAT and approval must be set up again. | OK here; document | `.mcp.json`; `.claude/settings.local.json` |
| E2 | `gh` CLI is authenticated as well (an alternative ticket source). | OK | `gh auth status` |
| E3 | `config.yml` must exist before `/ticket-spec` and `/ticket-fix` run (they hard-stop otherwise). It doesn't exist yet: `~/.sb/sbweb/` has no `sb-ticket-artifacts/`. | Expected (run init) | `config.md:29-33`; `ls ~/.sb/sbweb` |
| E4 | Branch logic: `git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/main` ✓. **But** spec commands refuse to switch branches with uncommitted changes, and the repo currently has some (the harness itself). | Medium (commit harness first) | `spec-identifiers.md:57-71` |
| E5 | Shell commands are given for POSIX and PowerShell, which matches this Windows + Git Bash/PowerShell machine. | OK | `logs-format.md:24-33`, `ticket-spec/SKILL.md:113-123` |
| E6 | Existing project hook `guard-commands.mjs` (blocks `prisma migrate dev`, warns on bare `pnpm --filter`) also applies inside the implementer. `project-hooks.md` tells agents how to react. This is a good fit. **[assumption]** Project `settings.json` hooks fire for subagent tool calls as well. | OK | `.claude/settings.json`, `.claude/hooks/guard-commands.mjs` |
| E7 | **The user-scope `sb` plugin is enabled in every project**, including this personal one. Its SessionStart, UserPromptSubmit, PostToolUse and Stop hooks (telemetry) and its skills (e.g. SmartBorder SCSS) load here. **[assumption]** It may also inject SmartBorder rules at session start through `session-start.ps1` (not read in full). | High (crosstalk) | `~/.claude/plugins/installed_plugins.json`, `~/.claude/settings.json`, plugin `hooks/hooks.json` |

### 5.4 Gaps, conflicts and redundancy with this repo

| # | Finding | Severity | Evidence |
|---|---|---|---|
| G1 | **No validate step.** `CLAUDE.md` "Done means" requires `/validate` (format, lint, typecheck, test, build, drift), Playwright specs with `data-testid`, and end-to-end verification in the running app. The ticket flow goes implement → review. Neither subagent is told to run the gates (the reviewer only reads). | High | `CLAUDE.md` "Done means"; `ticket-reviewer.md:28-34` |
| G2 | **No priming step.** Issue #1 asks for priming. `prime-codebase` exists (project and user scope) but isn't wired in. The architect's "explore the codebase" partly covers it. | Medium | issue #1; `.claude/skills/prime-codebase/` |
| G3 | **No self-improvement step.** Issue #1 asks for "auto improvement of the IA Layer". The flow never feeds lessons back into `CLAUDE.md` / `.claude/rules/`. `rules-check-drift` checks drift but isn't wired in. `project-standards.md` *reads* "recorded knowledge" but nothing *writes* it. | Medium | issue #1; `project-standards.md:7-15` |
| G4 | **Two planning systems.** `/planning` → `.claude/plans/<feature>.md` (500–700 lines) and `/execute <plan>` overlap with `/ticket-plan` and `/ticket-implement`. `CLAUDE.md` lists only the old ones. | Medium (decide which survives) | `.claude/commands/planning.md:22,97,305`; `CLAUDE.md:89` |
| G5 | **Commit/branch rules.** The implementer "never commit[s]"; `CLAUDE.md` has `/commit`. That's compatible, but the flow lacks a commit/PR step. Spec branch naming (`<TICKET-ID>-<slug>`) has no GitHub-issue form yet. | Low | `ticket-implementer.md:23`; `spec-identifiers.md:63-71` |
| G6 | **Reviewer is "read-only" only by instruction.** The skill says "isolated, read-only reviewer subagent", but the agent has `Bash`. Only its prompt limits it to read-only git. It could be enforced with `disallowedTools` or a hook. | Low | `ticket-review/SKILL.md:3`; `ticket-reviewer.md:4,28` |
| G7 | `CLAUDE.md` Map and "Area rules and skills" don't mention `.claude/agents/`, `.claude/shared/` or the ticket skills. `rules-check-drift` would flag this. | Low | `CLAUDE.md:63,89` |
| G8 | Name clash risk: a `/commit` exists in both the project commands and the sb plugin (`sb:commit`). Built-in `/code-review` and `/review` also exist. The `ticket-` prefix avoids clashes for the new skills. | Low | `ls` of plugin skills; skills listing |
| G9 | `.claude/settings.local.json` is being untracked (staged deletion + `.gitignore`). That matches the docs ("keep personal ones such as `settings.local.json` out of your commits"). Note it carries `enabledMcpjsonServers: ["github"]`, so a fresh clone must approve the server again. | OK | git status; claude-directory doc |

---

## 6. Proposed action plan

Ordered from blockers to nice-to-haves. Nothing has been executed.

### Phase 0 — Decisions (your call; see open questions)
1. Pick the **artifact location** (R3): in-repo vs external vault.
2. Pick the **fate of `/planning` + `/execute`** (G4).
3. Confirm **GitHub issues** as the only ticket source (R5).

### Phase 1 — Blockers (make the loop run)
4. **Rename subagent references** `sb:ticket-*` → `ticket-*` in `ticket-plan`, `ticket-implement`, `ticket-review` (R1).
5. **Remove `exec`** from the three agents' `tools` (R2). Optionally add `model:`, and add `disallowedTools: Write, Edit` to the reviewer and architect (G6).
6. **Re-root the artifacts** (R3, R4). Replace the `<vault>` definition in `rules.md:96-103` and `config.md` with the chosen path (e.g. `${CLAUDE_PROJECT_DIR}/.agents/specs/` or `.claude/specs/`), and drop the `sb-vault` reference. Update every `<vault>/sb-ticket-artifacts/...` occurrence (a single search-and-replace).
7. **Teach `/ticket-spec` GitHub ids** (R5, R6). Accept `#<n>`, `<n>`, `GH-<n>` and `https://github.com/<owner>/<repo>/issues/<n>`. Map the folder to e.g. `GH-<n>-<slug>`. Map the issue title → Description, the body → Problem / Acceptance criteria (marking the criteria "derived, confirm"). Update `spec-identifiers.md` resolution and branch rules to match.

### Phase 2 — Correctness and consistency
8. Replace `/sb:ticket-` with `/ticket-` across all 14 files (D4, R7). Rename headings `# /plan` → `# /ticket-plan` etc. (R9).
9. Replace "plugin root / `../..`" with `${CLAUDE_SKILL_DIR}/../../shared/ticket` or `${CLAUDE_PROJECT_DIR}/.claude/shared/ticket` (R8).
10. Commit the harness on a branch first, so the branch-switching steps aren't blocked by uncommitted changes (E4).
11. Decide on the `sb` plugin in this repo (E7). E.g. set `"enabledPlugins": { "sb@sbwebai": false }` in `.claude/settings.local.json` so work hooks and skills don't load here.

### Phase 3 — Fill the gaps from issue #1
12. **Validate step** (G1): add `/ticket-validate` (runs the existing `/validate` gates and records the results in `LOGS.md`), or have the implementer run `pnpm lint && pnpm typecheck && pnpm test` before returning `complete`. Then make the reviewer check for a passing validation entry.
13. **Priming** (G2): make `prime-codebase` a step of `/ticket-spec` or `/ticket-plan`, or have the architect invoke it (it has `Skill`).
14. **Self-improvement** (G3): add `/ticket-retro` after an `approved` review. It reads `LOGS.md` (deviations, corrections, findings), proposes minimal edits to `CLAUDE.md` / `.claude/rules/` / `shared/ticket/`, then runs `rules-check-drift`. Optionally keep a `lessons` file that `project-standards.md` points to as "recorded knowledge".
15. **Progress/resume** (issue #1) is already covered by `LOGS.md` + `/ticket-resume`. Optionally post status back to the GitHub issue (a comment per completed command). That would be an outward-facing action, so it should ask first.

### Phase 4 — Nice-to-haves
16. Retire or redirect `/planning` + `/execute`, and update the `CLAUDE.md` Map and "Area rules and skills" (G4, G7).
17. Add a commit/PR hand-off after `approved` that reuses `/commit` (G5).
18. Replace the generic examples with ecommerce ones (R10).
19. Document `GITHUB_PAT` setup for forks (E1).

### Open questions for you
1. **Where should spec artifacts live?** (a) in-repo, committed (e.g. `.agents/specs/`), so they're versioned with the code and visible to each client fork; (b) in-repo, gitignored; (c) a personal vault outside the repo, e.g. `~/.ecommerce-vault/`, but *not* the SmartBorder `~/.sb/sbweb/`.
2. **Keep or retire `/planning` + `/execute`?** The ticket flow's PLAN.md is shorter and question-driven; `/planning` targets 500–700 lines.
3. **Ticket id format for GitHub:** `GH-1`, `issue-1`, or `#1`-derived? This sets folder and branch names.
4. **Validate placement:** a separate `/ticket-validate` command, or folded into the implementer before it returns?
5. **Should the workflow write back to GitHub** (comments, labels, closing the issue)?
6. **Disable the `sb` work plugin for this repo?**
