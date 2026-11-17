---
name: story-fix
description: 'Applies findings from a REVIEW.md in auto, plan, or interactive mode, lets the user steer or pull in findings by code, and appends a Fix Summary.'
argument-hint: '[<story-id>] [codes…] [-a | -p | -i]'
disable-model-invocation: true
---

# /story-fix

Read review findings and fix all blocker and major issues. Record what was changed next to the findings.

`rules.md` is `${CLAUDE_PROJECT_DIR}/.claude/shared/story/rules.md`. Read it before Step 1 unless its full text is already in your context.

## Step 1 — Parse command arguments

The command takes one source — an optional positional story identifier (see `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`) — then optional finding codes and flags.

- If the first positional is shaped like a finding code, or a comma-separated list of them, the story identifier was omitted and every positional is a finding code. Otherwise the first positional is the story identifier and every positional after it is a finding code.
- Codes are separated by commas, spaces, or both — `n1,n2`, `n1 n2`, and `n1, n2` are the same. Match codes case-insensitively everywhere, and drop duplicates.
- `-a`, `-p`, `-i` pick the mode for this run: `auto`, `plan`, `interactive`, per **Fix mode** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`.

Examples:

- `/story-fix k3f9 S1 -p` — also fixes suggestion S1, in plan mode
- `/story-fix n1,n2` — the story comes from the branch or this session; also fixes minors N1 and N2

A positional after the story identifier that isn't shaped like a code (`B`, `M`, `N`, or `S` followed by digits) stops the command:

> "`<arg>` isn't a finding code. Codes look like `B1`, `M2`, `N1`, `S3`."

More than one of `-a`, `-p`, `-i` stops the command:

> "Conflicting flags: `<flag1>` and `<flag2>`. Pick one."

**Unknown flags** produce an error and stop:

> "Unknown flag `-x`. Supported flags: `-a (auto)`, `-p (plan)`, `-i (interactive)`."

---

## Step 2 — Resolve mode and scope

Determine the effective mode and scope for this run. Precedence is **flag > `commands.fix.mode`**.

### Load story workflow config

Check the config per **Required keys** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/config.md`.

### Compute in-scope findings

- In scope: each severity's `fix` default in **Finding severity** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md` (`include_minor` is `commands.fix.include_minor`), plus every finding the user names by code, as an argument or in a directive. Codes add to that scope, never narrow it.
- Everything else is deferred and listed under **Deferred**

---

## Step 3 — Resolve the story and read context

Resolve `<story-id>` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/story-identifiers.md`.

Read:

- `.agents/stories/<feature-name>/REVIEW.md` — the findings to fix
- `.agents/stories/<feature-name>/PLAN.md` — the technical plan
- `.agents/stories/<feature-name>/IMPLEMENTATION-SUMMARY.md` — what was built

If `REVIEW.md` is empty or missing, stop:

> "No review found for `<story-id>`. Run `/story-review <id>` first."

Check every code from the command arguments against the findings being fixed. A code that isn't there stops the command:

> "`<code>` isn't a finding in `REVIEW.md` for `<id>`. Findings: `<codes>`."

Then find the project's standards per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/project-standards.md`, reading only the parts that apply to the findings being fixed. Follow them, and cite a standard that shaped a fix on that finding's Fix Summary line.

---

## Step 4 — Apply fixes (mode-specific)

### Applying a finding

Apply a finding's `Fix:` at its own `file:line` and at every location on its `Also at:` line.

When a fix removes one failure mode but creates another, flag the trade where the templates below show it. It doesn't stop the run, even in `auto`.

While applying, post at most one short progress line per finding, such as `M1 done, running tests for M2…`, with no explanations.

### Directives by code

In `plan` and `interactive` modes, the user can steer individual findings by code in a free-form reply, several per message — e.g. "B2: use the existing validator instead. ignore M2. N3 is already fixed."

| Directive                                       | Effect                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| A different approach for a code                 | Replaces the finding's `Fix:` line. Recorded as user-directed.                                 |
| Ignore / skip                                   | Finding moves to **Skipped** — reason: ignored by user, plus any reason given.                 |
| Already fixed                                   | Finding moves to **Skipped** — reason: already fixed (per user). Not re-verified.              |
| Drop instances — e.g. "N5: leave `api/b.ts:40`" | Those locations aren't fixed. The rest of the finding is applied and noted as dropped by user. |

- A code that doesn't exist in the findings being fixed → stop and ask.
- A directive that's ambiguous about what to do → stop and ask.

### `auto` mode

Apply every in-scope fix without asking. Only the rules in Step 5 interrupt it.

### `plan` mode

Before touching any code, present a fix plan:

```
Fix plan — <id>

B1 — <title>
   Change: <one-line summary of intended change>
   Files:  <comma-separated list of files to be modified>

M1 — <title> (+<n> instances)
   Change: <one-line summary> — trades <old failure mode> for <new>
   Files:  <files>

(+<n> instances only when the finding's `Also at:` isn't "none")

Deferred: <out-of-scope codes, or "none">

Mode: plan
Total: <count per in-scope severity, e.g. 2 blockers, 1 major, 1 suggestion>

Apply all of these? Reply "yes", or steer by code — e.g. "B2: do X instead, skip M1".
```

- **"yes" (or similar)** → apply the plan as shown.
- **Directives** → apply the plan with the directives folded in. A reply made of directives is itself the confirmation; don't re-prompt unless something needs clarifying.
- **A plain decline** → stop and ask what to do differently.

### `interactive` mode

Work through in-scope findings one at a time. For each:

1. State the finding (code, title, `file:line`)
2. Describe the intended change in one or two lines, with the number of `Also at:` instances and any traded failure mode
3. Ask: "Apply this fix? (yes / skip / or tell me a different approach)"
4. Wait for the reply — any directive by code applies, including ones for findings later in the list
5. Apply, briefly note the result

---

## Step 5 — Rules while fixing

In every mode, change only what the findings being fixed document: don't refactor unrelated code or improve what isn't broken.

Each of these is a **Stop and ask** from `rules.md`, even in `auto`:

- A fix needs a design change
- A fix adds a dependency `PLAN.md` doesn't list
- A project standard conflicts with a finding's `Fix:` line
- A hook blocks a tool call and complying needs a person. Handle every hook per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/project-hooks.md`

---

## Step 6 — Record the fixes

### 6a. Fix Summary

Append a **Fix Summary** to the findings file `REVIEW.md`.

```markdown
## Fix Summary — <date>

### Mode

<auto | plan | interactive>

### Fixed

- [x] B1 — <title> — <brief note on how it was fixed>
- [x] B2 — <title> — <brief note> (user-directed: <the approach given>)
- [x] M1 — <title> — <brief note> (trades <old failure mode> for <new>)
- [x] M2 — <title> — <brief note> (dropped by user: <file:line>, …)
- [x] M4 — <title> — <brief note> (per <file>:<line>: <the standard>)
- [x] N1 — <title> — <brief note> (only if in scope this run; "(named by the user)" if pulled in by code)
- [x] S2 — <title> — <brief note> (named by the user)

### Skipped

- [ ] M3 — <title> — ignored by user<: reason, if given>
- [ ] N3 — <title> — already fixed (per user)
- [ ] B3 — <title> — blocked by a hook: <the hook's message>
      <"None" if every in-scope finding was applied.>

### Deferred

- [ ] N2 — <title> — deferred: not in scope this run
- [ ] S1 — <title> — deferred: suggestion, not auto-fixed

### New issues found during fix

<Any new issues discovered while fixing. "None" if clean.>
```

Every finding of the fixed pass appears exactly once — under Fixed, Skipped, or Deferred.

### 6b. Living artifacts and summary

Update `SPEC.md`, `PLAN.md` and `IMPLEMENTATION-SUMMARY.md` per **Artifact ownership** in `rules.md`.

### 6c. LOGS.md entry

Append `/story-fix completed` to `.agents/stories/<feature-name>/LOGS.md` per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/logs-format.md`, with `Next step:` per **Fix next step** in `${CLAUDE_PROJECT_DIR}/.claude/shared/story/vocabulary.md`.

---

## Step 7 — Hand off to user

Hand off per `${CLAUDE_PROJECT_DIR}/.claude/shared/story/result-format.md`.

```
/story-fix <id> completed
Artifact: `.agents/stories/<feature-name>/REVIEW.md` (fix summary appended)
Mode: <mode> — fixed: <codes> · skipped: <codes, or "none"> · deferred: <codes, or "none">
New issues found: <"no", or "yes — <note>">
Manual steps:
- <step>
Next: <the entry's Next step:>
```
