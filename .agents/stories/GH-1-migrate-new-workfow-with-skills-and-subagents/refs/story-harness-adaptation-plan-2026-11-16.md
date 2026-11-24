# Story workflow: adaptation plan (ticket → story, de-`sb`, de-vault, Devin → Claude)

**Date:** 2026-11-16
**Status:** proposal only. No harness file has been changed. This report is the only file written.
**Builds on:** `.claude/reports/ticket-harness-analysis-2026-11-16.md`, referred to below as "the analysis" (its §6 holds the original steps 1–19).
**Scope:** the 19 imported files under `.claude/skills/ticket-*/`, `.claude/agents/ticket-*.md` and `.claude/shared/ticket/` (1,779 lines), plus the files around them that reference them.

**Sources** (official Claude Code docs, fetched 2026-11-16):
- [Subagents](https://code.claude.com/docs/en/sub-agents) — frontmatter fields, `name` rules (no `:`), priority order, tools removed from subagents, unresolved `tools`
- [Skills](https://code.claude.com/docs/en/skills) — frontmatter, `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}`, precedence, collisions with built-in commands
- [Settings](https://code.claude.com/docs/en/settings) — precedence (local > project > user), how `settings.local.json` stays out of git
- [Memory](https://code.claude.com/docs/en/memory) — `.claude/rules/` loads recursively; `@path` imports

Claims marked **[assumption]** were inferred, not verified.

---

## 0. Summary

- The four changes touch **all 19 harness files** and nothing in app code. The only file outside `.claude/` that must change is `CLAUDE.md`, whose "Skills/Commands" line has to list the new names.
- **"Ticket" has two meanings, and that is the main ambiguity.** In about 60% of its 294 occurrences it means *this workflow* ("ticket workflow", `ticket-plan`, `shared/ticket/`); those become **story**. In the rest it means *an item in an external tracker* ("from a ticket", "ticket server", `<ticket-id>`, `tickets.server`). I recommend renaming those to **issue**, not story, because your tracker is GitHub Issues. Otherwise you get "a story spec from a story", which is confusing (open question Q2).
- **The `sb` prefix is not a file-name prefix here.** It is the plugin namespace `sb:` (`/sb:ticket-plan`, `sb:ticket-architect`, 73 occurrences) plus the vault folder `sb-ticket-artifacts` (44 occurrences). The files themselves are already named `ticket-*`. Removing `sb` therefore means removing the namespace and the vault, not renaming files. Your example `sb-spek → spek` has no literal counterpart in these files.
- **Keep the `story-` prefix on commands.** Without it, the commands collide with Claude Code built-ins: `/init` (built-in), `/review` (an alias of the bundled `/code-review`; the docs say the alias "never runs your skill") and `/plan` **[assumption: built-in plan-mode command; not on the pages I fetched]**. With the prefix there are no collisions (§1.5).
- **Artifacts:** I recommend **committing them in the repo** under `.agents/stories/<id>-<slug>/`, with the config at `.agents/stories/config.yml` (§2).
- **Devin → Claude is a small job.** Only `exec` (3 occurrences), the "plugin root" mechanism (about 25 occurrences) and the `sb`/vault conventions are Devin-specific or plugin-specific. The frontmatter, `disable-model-invocation`, the subagent-returns-questions loop and the `Skill` tool are already valid in Claude Code.

---

## 1. Impact inventory

### 1.1 Per-file counts (case-insensitive substring matches)

| File (under `.claude/`) | ticket | `sb:` | `sb-…`/`~/.sb`/`sbweb` | vault | plugin | `exec` |
|---|---:|---:|---:|---:|---:|---:|
| `agents/ticket-architect.md` | 5 | 0 | 1 | 1 | 4 | 1 |
| `agents/ticket-implementer.md` | 7 | 0 | 1 | 1 | 5 | 1 |
| `agents/ticket-reviewer.md` | 9 | 0 | 1 | 1 | 7 | 1 |
| `shared/ticket/config.md` | 22 | 13 | 9 | 0 | 0 | 0 |
| `shared/ticket/delegated-work.md` | 2 | 0 | 0 | 0 | 2 | 0 |
| `shared/ticket/logs-format.md` | 8 | 6 | 0 | 0 | 0 | 0 |
| `shared/ticket/project-hooks.md` | 3 | 1 | 0 | 0 | 0 | 0 |
| `shared/ticket/project-standards.md` | 1 | 0 | 0 | 0 | 2 | 0 |
| `shared/ticket/result-format.md` | 2 | 1 | 0 | 0 | 0 | 0 |
| `shared/ticket/rules.md` | 19 | 9 | 8 | 6 | 3 | 0 |
| `shared/ticket/spec-identifiers.md` | 30 | 8 | 5 | 5 | 0 | 0 |
| `shared/ticket/vocabulary.md` | 7 | 4 | 0 | 0 | 0 | 0 |
| `skills/ticket-fix/SKILL.md` | 19 | 1 | 5 | 5 | 0 | 0 |
| `skills/ticket-implement/SKILL.md` | 13 | 3 | 3 | 3 | 3 | 0 |
| `skills/ticket-init/SKILL.md` | 27 | 6 | 6 | 6 | 0 | 0 |
| `skills/ticket-plan/SKILL.md` | 12 | 2 | 3 | 3 | 3 | 0 |
| `skills/ticket-resume/SKILL.md` | 17 | 11 | 1 | 1 | 0 | 0 |
| `skills/ticket-review/SKILL.md` | 13 | 2 | 3 | 3 | 3 | 0 |
| `skills/ticket-spec/SKILL.md` | 81 | 6 | 8 | 8 | 0 | 0 |
| **Total (19 files)** | **294** | **73** | **≈44** | **43** | **25** | **3** |

There are also `PROJ-` examples (23 occurrences in 3 files), `Linear` (4), `claude_ai_Linear` (1), `devin` (1, in `rules.md:87` "devin-config"), `SmartBorder`/`sbweb` (6), and relative `../..` paths (40 occurrences in 8 files).

### 1.2 Change 1 — ticket → story

**Folder and file renames (10 renames, through `git mv`):**

| From | To |
|---|---|
| `.claude/skills/ticket-{init,spec,plan,implement,review,fix,resume}/` (7) | `.claude/skills/story-{…}/` |
| `.claude/agents/ticket-{architect,implementer,reviewer}.md` (3) | `.claude/agents/story-{…}.md` |
| `.claude/shared/ticket/` (1 folder, 9 files inside) | `.claude/shared/story/` |

**Frontmatter `name:` values (10).** These must match the new folder names (skills) and the new dispatch references (agents). Agent identity comes **only** from `name:`, not from the file name (Subagents doc).

**Content forms, workflow meaning → story:**

| Current form | Count | Becomes | Linked references that must change too |
|---|---:|---|---|
| `/sb:ticket-<cmd>` (7 commands + the generic `/sb:ticket-`) | 67 | `/story-<cmd>` | hand-off `Next:` lines in `result-format.md`, `logs-format.md`; error messages in `config.md`, `spec-identifiers.md` |
| `sb:ticket-{architect,implementer,reviewer}` | 6 | `story-{…}` | dispatch lines in `story-plan`, `story-implement`, `story-review` **and** `name:` in the 3 agent files |
| `ticket-<cmd>` bare (headings, `skills/ticket-<command>/`, `ticket-<next-command>`) | ≈70 | `story-<cmd>` | `rules.md:87-94` path table |
| `../../shared/ticket/*.md` and `shared/ticket/` | 40 | `…/shared/story/…` (and see §1.5 on the path form) | all 7 SKILL.md files |
| "ticket workflow", "ticket command", "Ticket workflow rules/vocabulary", "Ticket implementer/reviewer" | ≈25 | "story workflow" etc. | `rules.md:1,3,75`, `vocabulary.md:1,3,50`, `result-format.md:3`, `delegated-work.md:4,13`, `spec-identifiers.md:12,32`, `config.md:33`, `ticket-init:3,9`, `ticket-fix:44`, `ticket-resume:28`, agents `:7,:15-17` |
| `sb-ticket-artifacts` | 44 | removed (replaced by the new artifact root, see change 3) | — |

**Places where "ticket" means an external tracker item (flagged as you asked). These should not become "story":**

| Form | Where | Proposal |
|---|---|---|
| "from a ticket", "ticket spec", "spec without a ticket", "fetch the ticket" | `ticket-spec` (≈45 lines: 3, 10, 18-20, 27-28, 32-62, 78-81, 112-135, 153, 193), `spec-identifiers.md:5,6,16,31,33,77,78` | **issue** ("from an issue", "issue-linked story", "standalone story") |
| `<ticket-id>`, `<ticket-url>`, `<ticket-title>`, `<TICKET-ID>-<slug>` | `ticket-spec` frontmatter `argument-hint` and body, `spec-identifiers.md:5`, `rules.md:101` | `<issue-id>`, `<issue-url>`, `<issue-title>`, `<ISSUE-ID>-<slug>` |
| "ticket server", the `tickets.server` config key, "Do you pull tickets from a tracker…" | `ticket-init:34-66`, `config.md:11,23`, `ticket-spec:40-41`, `project-standards.md:9` | `issues.server`, or drop the key if GitHub is hard-wired (Q4) |
| `Source` = "a ticket id, or `none`" | `logs-format.md:57,92` | "an issue id, or `none`" |
| "JIRA, Linear, GitHub" examples, `claude_ai_Linear`, `PROJ-1234`, `some-org.atlassian.net` | `ticket-init:35,37`, `ticket-spec:10,19-28`, `config.md:12`, `spec-identifiers.md` | GitHub examples: `GH-12`, `#12`, `https://github.com/<owner>/<repo>/issues/12`; server `github` (the name in `.mcp.json`) |
| "an environment variable or a **ticket file**" (hook approval mechanism) | `project-hooks.md:19` | **Ambiguous.** It means a generic approval token file, not this workflow and not the tracker. Proposal: "an approval file". |
| "future ticket", "separate ticket" | `.claude/plans/*.md` (5), `.claude/archive/module-prompts/*.md` (5) | **Keep.** Plain English in historical documents, outside this workflow; out of scope. |

**Riskiest or most ambiguous cases:**
1. **Order of the bulk replace.** A naive `ticket→story` would turn `sb-ticket-artifacts` into `sb-story-artifacts` and `<ticket-id>` into `<story-id>`. Replacements must run from most specific to least specific, and the external-meaning lines need a manual pass (§5).
2. **`spec` vs `story` as the unit.** The workflow calls its unit a *spec* (`<spec-id>`, `specs/<folder>/`, "spec folder"). Renaming the workflow to *story* leaves "spec" as the unit's name. I recommend `stories/<id>/SPEC.md` and `<story-id>`, keeping **SPEC.md** as the document (Q3). That adds about 60 more `spec-id`/"spec folder" edits.
3. **The `<repo>-<code>` id and branch matching** in `spec-identifiers.md:6,16,31,77`. This changes if the repo prefix is dropped (§2).

### 1.3 Change 2 — remove `sb`

| Occurrence | Count | Action |
|---|---:|---|
| `/sb:` command namespace | 67 | drop the namespace (merged with 1.2) |
| `sb:` agent namespace | 6 | drop it. A `:` in a project agent `name` is invalid anyway: "Names can't contain `:`, which is reserved for plugin-scoped identifiers" (Subagents doc) |
| `sb-ticket-artifacts` | 44 | replace with the new artifact root (change 3) |
| `sb-vault` rule reference | 1 (`rules.md:96`) | delete; the rule doesn't exist in this repo |
| "ships with the `sb` plugin (devin-config)" | 1 (`rules.md:87`) | rewrite as "lives in this repo's `.claude/`" |
| `~/.sb/sbweb/…`, `$env:USERPROFILE\.sb\sbweb`, `$HOME/.sb/sbweb` | 6 (`config.md:3,31,37`, `rules.md:103`) | replace with the repo-relative root |
| "SmartBorder" naming | in the vault path only | gone with the line above |

**Collision check after removing the prefix:**

| Candidate name | Collides? |
|---|---|
| `story-init`, `story-spec`, `story-plan`, `story-implement`, `story-review`, `story-fix`, `story-resume` | **No.** Compared with this repo's skills (`new-api-module`, `schema-migration`, `rules-check-drift`, `prime-codebase`), commands (`planning`, `execute`, `validate`, `commit`, `check-ignore-comments`), the user skills listed in this session, and built-ins. |
| `story-architect`, `story-implementer`, `story-reviewer` | **No.** Built-in agent types are `Explore`, `Plan`, `general-purpose`, `claude-code-guide`, `statusline-setup`. |
| Dropping `story-` too (`/init`, `/review`, `/plan`, `/fix`, `/spec`) | **Yes, three of them.** `/init` is a built-in, and a project skill would *replace* it ("your skill replaces the built-in command" — Skills doc). `/review` is a bundled alias that "never runs your skill" (Skills doc). `/plan` **[assumption]**. Don't drop it. |
| The installed `sb@sbwebai` plugin's own skills and hooks | **No name collision.** They are namespaced `sb:` by the plugin system. They still *load* in this repo (see step 11 in §3). |

### 1.4 Change 3 — vault and save paths

Every path-bearing site (≈50 lines). All of them go from `<vault>/sb-ticket-artifacts/…` to the new root (recommended: `.agents/stories/…`).

| Site | Lines |
|---|---|
| Definition of `<vault>` and the two-roots table | `rules.md:83-103` (rewrite the whole section) |
| Config location | `config.md:3,31,37`; `ticket-init` frontmatter `description` and body; `ticket-spec:40`; `ticket-fix` ("Load ticket workflow config") |
| Spec folders | `ticket-spec:44-45,134-135`; `spec-identifiers.md:33` (listing); `ticket-resume:28`; `ticket-fix`, `ticket-plan:31`, `ticket-implement:31`, `ticket-review:31` (dispatch prompts); the 3 agents' "Your prompt contains…" lines |
| Example folder `some-web-k3f9-user-login` | `spec-identifiers.md:6`, plus 3 more |

Also to decide: the `vault-approve.ps1` hook in the `sb` plugin auto-approves writes **only** under `~/.sb/sbweb` (analysis, E7). Once the artifacts live in the repo, that hook is irrelevant, and writes go through the repo's normal permissions.

### 1.5 Change 4 — Devin → Claude Code

| Devin / plugin concept | Where | Claude Code equivalent | Source |
|---|---|---|---|
| `exec` in `tools:` (Devin's shell tool) | 3 agents, line 4 | Remove it; `Bash` is already listed. Optionally add `PowerShell` for Windows. | Subagents doc: entries that don't resolve are flagged, and if *none* resolve the launch is refused. Today the agents load, because the other entries resolve (seen in this session's agent list). |
| `sb:ticket-architect` dispatch ("Invoke the … subagent") | `ticket-plan:28`, `ticket-implement:28`, `ticket-review:28` | "Use the Agent tool with `subagent_type: story-architect`" | Subagents doc (invocation by `name`) |
| "Plugin root" passed in the prompt, `<plugin-root>/shared/ticket/*.md` | `delegated-work.md:3-4`; the `Plugin root:` line in 3 skills; `<plugin-root>/…` 11× in the agents | Remove the concept. Skills reference `${CLAUDE_PROJECT_DIR}/.claude/shared/story/<file>.md` (a substitution the Skills doc documents). Agents reference the repo-relative `.claude/shared/story/<file>.md`. **[assumption: a subagent's working directory is the project root, so relative paths resolve; verify in the dry run]** | Skills doc ("`${CLAUDE_PROJECT_DIR}`: The project root directory") |
| Relative `../../shared/ticket/…` in SKILL.md | 40× in 7 skills | Same as above. `../..` works only because `.claude/` happens to mirror the plugin layout (analysis, D-section). | Skills doc |
| "rule `sb-vault`", "devin-config" | `rules.md:87,96` | delete | — |
| `description: … Invoked internally by /review` / `by implement` | `ticket-reviewer.md:3`, `ticket-implementer.md:3` | "Dispatched by /story-review" etc. `/review` is a real Claude Code alias for `/code-review`, so the current text is actively misleading. | Skills doc |
| "Asks the questions one at a time" (dispatcher) | `delegated-work.md`, `ticket-spec`, `ticket-fix` | Keep it, and optionally let the *main session* use `AskUserQuestion` for questions that have options (subagents can't use it — Subagents doc lists it among tools removed from every subagent; the existing return-questions loop already respects that). | Subagents doc |
| `project-standards.md:5`: "the hooks of the plugins the project enables" | standards discovery | Valid in Claude Code. But it means the reviewer and architect would treat the `sb` plugin's hooks as *this repo's* standards while that plugin is enabled. Another reason for step 11. | Settings doc |
| `AGENTS.md` mention | `project-standards.md` | Valid; Claude Code reads `AGENTS.md` too (Memory doc). `apps/web/AGENTS.md` exists. | Memory doc |
| POSIX + PowerShell dual snippets (timestamps, codes) | `logs-format.md:22-33`, `ticket-spec:113-121` | **Keep.** This machine has both shells. | — |
| `disable-model-invocation`, `argument-hint`, `name`, `description`, `tools`, the `Skill` tool | all files | **Already Claude-native.** No change needed. | Skills and Subagents docs |
| `.claude/shared/` location | — | Fine as it is. It isn't reserved and isn't auto-loaded (only `rules/`, `skills/`, `agents/`, `commands/` are), so it costs no context until it's read. **Don't** move it to `.claude/rules/`: everything there loads into every session (Memory doc: "discovered recursively"). | Memory doc |

Optional additions supported by the docs: `model:` per agent (e.g. `opus` for architect and reviewer); `skills: [prime-codebase]` on the architect to preload priming (Subagents doc: `skills` preloads skill content, except skills with `disable-model-invocation: true`).

---

## 2. Artifact storage recommendation (change 3)

### What the workflow writes

Per story: `SPEC.md` (living), `PLAN.md` (living), `IMPLEMENTATION-SUMMARY.md` (record), `REVIEW.md` (record, with a Fix Summary appended), `LOGS.md` (append-only source of truth), `refs/` (inputs: pasted docs, screenshots). Per project: `config.yml`. Sizes are small text, except anything dropped into `refs/`.

### Options

| | A. In repo, **committed** | B. In repo, **gitignored** | C. Outside the repo (personal folder) | D. Hybrid: committed, but `refs/` binaries ignored |
|---|---|---|---|---|
| Survives a machine change or reinstall | ✅ | ❌ | ⚠️ only if you back it up | ✅ |
| Travels with the code to each client fork | ✅ the fork inherits the upstream's story history | ❌ | ❌ | ✅ |
| Reviewable in PRs, next to the code it explains | ✅ | ❌ | ❌ | ✅ |
| `/story-resume` works in a worktree or cloud session | ✅ (files are in the checkout) | ❌ a worktree has a different untracked state | ❌ cloud can't see it | ✅ |
| Repo noise | ⚠️ 5–6 files per story | ✅ none | ✅ none | ⚠️ |
| Risk of committing something sensitive pasted into `refs/` | ⚠️ | ✅ | ✅ | ⚠️ (smaller) |
| Matches existing practice | ✅ `.claude/plans/*.md` (old `/planning` output) and `.agents/PRD.md` are committed | `.claude/reports/` (gitignored, local reports) | the work vault model (made for 30+ devs) | — |
| Multi-dev later | ✅ works. Collision-free ids (GH issue numbers, random codes). The only conflict risk is two people on the same story's `LOGS.md`. | ❌ no sharing | ❌ needs a shared vault again | ✅ |

### Recommendation: **A (committed), with one guard from D**

```
.agents/
  PRD.md                          (existing)
  stories/
    config.yml                    # was ~/.sb/sbweb/sb-ticket-artifacts/config.yml
    README.md                     # optional one-screen index: id · title · status · branch
    GH-12-add-csv-export/         # story from GitHub issue #12
      SPEC.md
      PLAN.md
      IMPLEMENTATION-SUMMARY.md
      REVIEW.md
      LOGS.md
      refs/
    k3f9-user-login/              # standalone story (no issue)
      …
```

Why `.agents/` and not `.claude/`: `.claude/` holds the *harness* (how agents work). `.agents/` already holds *product work input* (`PRD.md`). Stories are work product. Keeping them apart also means `rules-check-drift` and future harness edits never wade through story folders. The alternative `.claude/stories/` sits next to the existing `.claude/plans/` and is equally workable (Q1).

**Naming convention:**
- From an issue: `GH-<n>-<slug>`. The id is `GH-<n>` (case-insensitive). The branch is `<type>/GH-<n>-<slug>`.
- Standalone: `<code>-<slug>`. Drop the `<repo>-` prefix: it existed only because the vault mixed many repos, and in a fork it would carry the client's repo name. `<code>` = 4 random `[a-z0-9]`. **This changes `spec-identifiers.md`'s branch matching rule** (`<repo>-<code>` → `<code>`).
- `<slug>`: kebab-case, at most about 5 words, from the issue title or the inferred feature name (unchanged logic).
- Guard: add `.agents/stories/**/refs/**/*.{png,jpg,jpeg,gif,pdf,zip}` to `.gitignore` **[optional; Q5]**, and a line in `rules.md`: never paste secrets or customer data into `refs/`.

**If more developers join:** A keeps working as it is. Add CODEOWNERS for `.agents/stories/` if you want review on plans. Consider *one owner per story* to avoid `LOGS.md` merge conflicts. Only go back to an external shared vault if stories need to span several repos, which is the original 30-dev reason and doesn't apply to fork-per-client.

---

## 3. Explanations: original steps 5, 9 and 11

### Step 5 — "Remove `exec` from the three agents' `tools`; optionally add `model:` and `disallowedTools`"

- **What:** delete `exec` from `tools:` in `ticket-architect.md:4`, `ticket-implementer.md:4`, `ticket-reviewer.md:4`.
- **Why:** `exec` is Devin's shell tool name, and Claude Code has no tool by that name. Claude's shell is `Bash` (plus `PowerShell` on Windows), and `Bash` is already listed.
- **Affects:** only those 3 lines. No other file references the `tools` lists.
- **If done:** the frontmatter becomes honest and portable. Nothing changes functionally.
- **If skipped:** the agents still launch today: this session lists them with `exec` in their tools, and the docs refuse a launch only when *nothing* resolves. The risks are (a) noise or warnings in `claude doctor`/debug output **[assumption]** and (b) a confusing failure if Claude Code ever ships a tool with that name. Low severity, but it's a one-line fix per file.
- **Correction to the analysis:** I suggested adding `disallowedTools: Write, Edit` to the reviewer and architect. That is **redundant**: `tools:` is an allowlist, and neither agent lists `Write`/`Edit`. The real write path for them is `Bash` (e.g. `echo > file`). If you want them read-only in practice, the options are: drop `Bash` from the reviewer (but it needs `git diff`), or keep `Bash` and rely on the instructions. I recommend keeping things as they are and dropping that sub-item. `model:` stays optional (e.g. `opus` for architect and reviewer, `inherit` for the implementer).

### Step 9 — "Replace 'plugin root / `../..`' with `${CLAUDE_SKILL_DIR}/../../shared/ticket` or `${CLAUDE_PROJECT_DIR}/.claude/shared/ticket`"

- **What it is:** the harness was a plugin. Each dispatching skill computed the plugin's install directory (`../..` from the skill folder) and passed it to the subagent as `Plugin root: <path>`, so the subagent could find `shared/ticket/*.md`.
- **Plugin-related part:** the *concept* of a plugin root, the `Plugin root:` prompt line, and `<plugin-root>/…` in the agents. In a real plugin this would be `${CLAUDE_PLUGIN_ROOT}`, which the Skills doc says is "substituted only in plugin skills".
- **Does it apply now?** **Yes, in a simplified form, and it can't be deferred.** Since we're not a plugin, the location is fixed: `.claude/shared/story/` in this repo. Drop the computed root entirely: skills use `${CLAUDE_PROJECT_DIR}/.claude/shared/story/…` and agents use `.claude/shared/story/…`. The dispatch prompt shrinks to one line: the story folder path. `delegated-work.md:3-4` changes to match.
- **Defer:** only the "make it portable as a plugin" variant (`${CLAUDE_PLUGIN_ROOT}`). Revisit when or if you package it.

### Step 11 — "Decide on the `sb` plugin in this repo"

- **What it is:** not *our* plugin. `sb@sbwebai` is the work plugin installed at user level (`~/.claude/settings.json`: `"sb@sbwebai": true`). User-level means it loads in **every** project, this one included: its SessionStart hook, the `vault-approve.ps1` PreToolUse hook (auto-approves writes under `~/.sb/sbweb`), telemetry, and its `sb:*` skills (analysis, E7).
- **Plugin-related?** It's about an *installed* plugin, not about creating one. So "we're not creating a plugin yet" doesn't make it moot.
- **Does it apply now?** Yes, and it's cheap. Add `"enabledPlugins": { "sb@sbwebai": false }` to `.claude/settings.local.json`, which is personal and gitignored. Local settings outrank user settings (Settings doc: precedence order). **[assumption: exact `enabledPlugins` value syntax as in the analysis; confirm with `/status` or `/plugin` after the change.]**
- **If done:** no work hooks or telemetry in a personal repo. The reviewer won't treat the work plugin's hooks as "project standards" (`project-standards.md:5`). Stale `sb:` skills can't be picked up by mistake.
- **If skipped:** work telemetry runs on personal sessions, there is extra context from the `sb:` skill listings, and the `sb:` skills stay one keystroke away while the story workflow is fresh.
- **Recommendation:** do it in Phase 1. It's independent of the renames.

---

## 4. Consolidated, revised action plan

Legend: **K** = kept, **M** = modified, **D** = deferred, **X** = dropped, **N** = new (from your changes 1–4).

### Phase 0 — Decisions (your call, see questions below)
| # | Step | Origin |
|---|---|---|
| 0.1 | Artifact root and commit policy (§2). | M (orig 1) |
| 0.2 | Vocabulary: workflow = story; external item = issue; unit = story with SPEC.md (Q2, Q3). | N |
| 0.3 | GitHub id format `GH-<n>`; tracker hard-wired to GitHub or kept configurable (Q4). | M (orig 3, 7) |
| 0.4 | Fate of `/planning` + `/execute`. Can wait until Phase 4. | K (orig 2) |

### Phase 1 — Blockers: one coherent rename + port change set
| # | Step | Origin |
|---|---|---|
| 1.1 | Create branch `chore/story-workflow`. First commit the harness **as imported** (baseline), so the rename diff is reviewable and the branch-switch guard in `spec-identifiers.md` isn't tripped by uncommitted changes. Keep `.gitignore`, `settings.local.json` and `.mcp.json` in a separate commit. | M (orig 10, moved earlier) |
| 1.2 | `git mv` the 10 renames (§1.2). | N (change 1) |
| 1.3 | Scripted replace, most specific first (§5): `/sb:ticket-` → `/story-`; `sb:ticket-` → `story-`; `<vault>/sb-ticket-artifacts/specs/` → `.agents/stories/`; `<vault>/sb-ticket-artifacts/config.yml` → `.agents/stories/config.yml`; `shared/ticket/` → `shared/story/`; `ticket-` → `story-`. | M (orig 4, 6, 8) + N |
| 1.4 | Manual pass on the ≈60 external-meaning lines: ticket → issue (§1.2 table), including the `argument-hint`, `tickets.server`, `<ticket-id>` and the `project-hooks.md:19` wording. Then the workflow-meaning prose ("ticket workflow" → "story workflow"). | N (change 1) |
| 1.5 | Rewrite `rules.md` "Path conventions" (one root, in the repo), `config.md` location lines, and remove `sb-vault`/devin-config. | M (orig 6) + N (change 2) |
| 1.6 | Devin → Claude: remove `exec`; remove the plugin-root mechanism (dispatch prompt = story folder only; skills use `${CLAUDE_PROJECT_DIR}/.claude/shared/story/`, agents use repo-relative paths); dispatch wording "Agent tool, `subagent_type: story-…`"; fix the agent `description`s (`/review` → `/story-review`). | M (orig 5 without disallowedTools, orig 9) + N (change 4) |
| 1.7 | GitHub ids in `story-spec` + `spec-identifiers.md`: accept `GH-<n>`, `#<n>`, `<n>`, issue URL. Folder `GH-<n>-<slug>`. Standalone `<code>-<slug>` (drop `<repo>-`). Fetch via `mcp__github__issue_read` (the server is `github` in `.mcp.json`). | M (orig 7) |
| 1.8 | Update `CLAUDE.md` line 89 (Skills/Commands) and the Map `.claude/` line to list `story-*` and `shared/`. Required for consistency; otherwise `rules-check-drift` flags it. | M (part of orig 16, pulled forward) |
| 1.9 | Disable `sb@sbwebai` in `.claude/settings.local.json`. | K (orig 11) |

### Phase 2 — Verify the rename (see §5)
| # | Step | Origin |
|---|---|---|
| 2.1 | Leftover searches return zero (or only the allowlisted lines). | N |
| 2.2 | Link check: every referenced `.claude/shared/story/*.md` path exists. | N |
| 2.3 | Discovery: the `/` menu shows the 7 `story-*` skills; the agent list shows 3 `story-*` agents. | N |
| 2.4 | Dry run: `/story-init` → `/story-spec GH-1` (issue #1) → `/story-plan` → check `PLAN.md` + `LOGS.md` land in `.agents/stories/GH-1-…/`. Stop before implement. | N |

### Phase 3 — Fill the gaps from issue #1
| # | Step | Origin |
|---|---|---|
| 3.1 | Validate step: `/story-validate` (runs the `/validate` gates and logs the result) **or** the implementer runs them before `complete`; the reviewer requires a passing entry. | K (orig 12) |
| 3.2 | Priming: `skills: [prime-codebase]` on `story-architect` (preload), or a step in `/story-spec`. Note: `prime-codebase` must **not** have `disable-model-invocation: true` to be preloadable (it doesn't today). | M (orig 13, now with the verified `skills` field) |
| 3.3 | Self-improvement: `/story-retro` after `approved`. Proposes minimal edits to `CLAUDE.md`/rules/`shared/story/`, then runs `rules-check-drift`. | K (orig 14) |
| 3.4 | Progress/resume: already covered by `LOGS.md` + `/story-resume`. Optional GitHub comment per completed command, asked each time. | K (orig 15) |

### Phase 4 — Nice-to-haves
| # | Step | Origin |
|---|---|---|
| 4.1 | Retire or redirect `/planning` + `/execute`; move `.claude/plans/` history or leave it. | K (orig 16, remainder) |
| 4.2 | Commit/PR hand-off after `approved`, reusing `/commit`. | K (orig 17) |
| 4.3 | Ecommerce examples instead of generic ones (`user login` → e.g. `add-csv-export` is fine; `PROJ-` already gone in 1.4). | M (orig 18, mostly absorbed by 1.4) |
| 4.4 | Document `GITHUB_PAT` for forks. | K (orig 19) |
| 4.5 | Package as a plugin (`${CLAUDE_PLUGIN_ROOT}`, a namespace like `story:`). | **D** (new; not now) |

**Dropped:** the `disallowedTools` sub-item of orig 5 (**X**, redundant, see §3). Orig 8 and 9 survive only inside 1.3/1.6 (**M**, no separate step).

### Decisions (2026-11-16)
All seven questions below were answered **Yes**, which accepts the recommended option for each:
- Artifacts are committed under `.agents/stories/`.
- External tracker items are called **issue**.
- The unit is `<story-id>`, with `stories/<id>/SPEC.md`.
- GitHub is hard-wired as the tracker, and `config.yml` holds only the fix defaults.
- Binary files under `refs/` are gitignored.
- Standalone ids drop the `<repo>-` prefix.
- The baseline is committed first: done on branch `ecom-1-story-workflow-migration` (`683a563` harness, `f2008d7` config).

### Open questions
- **Q1.** Artifact root: `.agents/stories/` (recommended) or `.claude/stories/`?
- **Q2.** External tracker items: rename "ticket" → **issue** (recommended), or keep "ticket" for the external meaning?
- **Q3.** Unit name: `<story-id>` + `stories/<id>/SPEC.md` (recommended), or keep `<spec-id>` + `specs/`?
- **Q4.** Tracker: hard-wire GitHub (drop `/story-init`'s server question; keep only fix-mode defaults), or keep it configurable? I recommend hard-wiring, with `config.yml` holding `fix.mode` and `fix.include_minor` only.
- **Q5.** Ignore binary files under `refs/`? (Recommended: yes.)
- **Q6.** Standalone ids: drop the `<repo>-` prefix (recommended)?
- **Q7.** Commit the imported baseline first (1.1), or squash everything into one commit at the end?

---

## 5. Execution proposal (after approval)

All edits on branch `chore/story-workflow`, in four commits: baseline → mechanical rename → manual semantic pass + Claude port → `CLAUDE.md`/settings.

**Step A — baseline.** `git switch -c chore/story-workflow`. Commit the imported files untouched (`.claude/skills/ticket-*`, `.claude/agents`, `.claude/shared`). Commit the `.gitignore`/`settings.local.json`/`.mcp.json` changes separately.

**Step B — moves.**
```bash
for c in init spec plan implement review fix resume; do git mv .claude/skills/ticket-$c .claude/skills/story-$c; done
for a in architect implementer reviewer; do git mv .claude/agents/ticket-$a.md .claude/agents/story-$a.md; done
git mv .claude/shared/ticket .claude/shared/story
```

**Step C — ordered mechanical replace** (a small Node or sed script over the 19 files only; order matters):
1. `<vault>/sb-ticket-artifacts/specs/` → `.agents/stories/`
2. `<vault>/sb-ticket-artifacts/config.yml` → `.agents/stories/config.yml`
3. `~/.sb/sbweb/sb-ticket-artifacts/config.yml` → `.agents/stories/config.yml`
4. `/sb:ticket-` → `/story-`
5. `sb:ticket-` → `story-`
6. `<plugin-root>/shared/ticket/` → `.claude/shared/story/` (agents)
7. `../../shared/ticket/` → `${CLAUDE_PROJECT_DIR}/.claude/shared/story/` (skills)
8. `shared/ticket/` → `shared/story/`
9. `ticket-` (word-start, followed by a command or role name) → `story-`

Commit. The diff is purely mechanical and easy to review.

**Step D — manual edits** (each listed in §1): the external-meaning lines → issue; the workflow prose → story; `rules.md` path section; `config.md`; `delegated-work.md` (no plugin root); the 3 dispatch blocks; the 3 agent `tools`/`description`/"Your prompt contains" lines; `story-spec` + `spec-identifiers.md` GitHub ids; the `story-init` question set (per Q4). Commit.

**Step E — `CLAUDE.md` line 89 + Map; `.claude/settings.local.json` `enabledPlugins`; optional `.gitignore` for `refs/` binaries.** Commit.

**Step F — verify that nothing is left behind:**
```bash
# 1. Leftovers: each must print nothing (or only the allowlisted lines; the allowlist is decided by Q2)
git grep -nIiE 'ticket'                         -- .claude/skills/story-* .claude/agents .claude/shared CLAUDE.md
git grep -nIE  'sb:|sb-|~/\.sb|sbweb|\bsb\b'    -- .claude/skills/story-* .claude/agents .claude/shared
git grep -nIiE 'vault|<vault>'                  -- .claude/skills/story-* .claude/agents .claude/shared
git grep -nIiE 'devin|\bexec\b|plugin.root|<plugin-root>|CLAUDE_PLUGIN' -- .claude/skills/story-* .claude/agents .claude/shared
git grep -nIE  'PROJ-|Linear|JIRA|atlassian|claude_ai_' -- .claude/skills/story-* .claude/agents .claude/shared
# 2. No stale folders
ls .claude/skills | grep -i ticket; ls .claude/shared
# 3. Every referenced shared file exists
git grep -hoE 'shared/story/[a-z-]+\.md' -- .claude | sort -u | sed 's#^#.claude/#' | xargs -I{} sh -c 'test -f {} || echo MISSING {}'
# 4. Frontmatter names match folders and dispatch targets
git grep -nE '^name:' -- .claude/skills/story-* .claude/agents
git grep -nE 'subagent_type|story-(architect|implementer|reviewer)' -- .claude/skills/story-*
```
Then in Claude Code: the `/` menu shows the 7 `story-*` commands; the agents list shows the 3 `story-*` agents (no `exec`); run the Phase 2.4 dry run on issue #1; then run `/validate`, which also runs `rules-check-drift` over the `CLAUDE.md` change.

**Done when:** all searches are clean, the dry run writes `SPEC.md`, `PLAN.md` and `LOGS.md` under `.agents/stories/GH-1-…/`, and `/validate` passes. No file outside `.claude/`, `.agents/stories/`, `CLAUDE.md` and `.gitignore` changed.
