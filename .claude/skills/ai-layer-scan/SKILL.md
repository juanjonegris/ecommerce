---
name: ai-layer-scan
description: "Temporary AI-layer improvement scan for this repo. Point it at ONE story run (a .agents/stories/<id>/ folder) to find what in CLAUDE.md, .claude/rules, skills, subagents or hooks would have prevented a specific failure (the reactive loop — 'that went wrong, what should change in the AI layer?'), or at a window of Claude Code session logs to find recurring patterns worth encoding (the proactive scan). Outputs a shape-only HTML report to .claude/reports/. Use to evolve the AI layer from real usage."
---

# AI-layer scan — find what to change, from what actually happened

> **Temporary.** This is a stop-gap for improving this repo's AI layer while the story workflow matures. Retire it
> once `/story-retro` and `rules-check-drift` cover what it finds. Don't build structure around it.

Reads your agent's own capabilities, plus **one target you choose**, and recommends which primitive each finding
should become. In this repo the agent is **Claude Code**. The method itself is agent-agnostic: it learns the
agent's capabilities first, then maps what it finds to the **full primitive palette** (rules · skill · hook ·
subagent · MCP · automation/workflow).

**How it relates to `/story-retro`:** `/story-retro` proposes edits from one approved story. This scan looks at
things retro can't see: a run that went wrong before it reached retro, or patterns across many stories and
sessions. Don't re-propose what a story's `RETRO.md` already accepted or rejected.

**Two targets, one skill — this is the whole design:**

- **A run → the REACTIVE loop.** Something just went sideways in a loop you ran. Point the scan at that run's
  artifacts and ask _"what in the AI layer would have prevented this?"_ You fix the system, not the code.
- **A window of logs → the PROACTIVE scan.** Nothing is broken. Point it at weeks of sessions and ask _"what do I
  keep doing by hand that should be encoded?"_

Same skill, same output shape — you're just changing what it reads.

This is a **discovery** tool — _what to change_ — NOT a quality **eval** (_whether a built thing is good_). Keep
the two separate.

## Inputs — ask for any that weren't given

`$ARGUMENTS` may carry some of these; ask for whatever's missing, don't guess.

1. **Where the agent's own docs live** — the capability and extensibility docs, so the scan knows what the agent
   _can become_ (its real extension points). Default here: the Claude Code docs at `https://code.claude.com/docs`
   (skills, subagents, hooks, memory and rules, MCP, settings). Use another source only if the user names one.
2. **What to scan** — exactly one of:
   - **A RUN (reactive)** — the artifacts one loop left behind. In this repo that's a story folder
     `.agents/stories/<id>-<slug>/` (`SPEC.md`, `PLAN.md`, `IMPLEMENTATION-SUMMARY.md`, `VALIDATION.md`,
     `REVIEW.md`, `RETRO.md`, `LOGS.md`), plus the story's commits and diff, and the PR body if there is one. Add
     that run's session log too if you can point at it. _These are already scoped to the run, so there's no
     session-hunting to do._

     **An orchestrated or automated run counts** — and then the target is three-layered, and whoever invokes the
     scan (a person or the orchestrator itself) should hand over the run's manifest: the symptom, the artifact
     paths, and _what ran_:
     1. **The trail** — the artifacts above, plus the run's digests and run log if the orchestrator keeps one.
     2. **The system that ran** — the components that ran, and the hooks that fired. In this repo, for a story
        run, that means:
        - the story skills (`.claude/skills/story-*`), the subagents (`.claude/agents/story-*.md`) and their
          shared rules (`.claude/shared/story/`)
        - `.claude/settings.json`, and the hook script `.claude/hooks/guard-commands.mjs`
        - `.github/workflows/ci.yml` if CI was involved

        These are part of the target, not background: the change you propose will live in one of them.

     3. **The execution logs** — the orchestrating session's transcript and the per-agent transcripts. Claude
        Code keeps these at `~/.claude/projects/<this-project>/<session-id>/subagents/agent-*.jsonl`, each with a
        `.meta.json` naming the agent type and its task (that's your map from agents to stages). Stages spawned
        as separate `claude -p` runs have their own session transcripts.

   - **A WINDOW OF LOGS (proactive)** — where the agent keeps session logs, plus how far back. Claude Code:
     `~/.claude/projects/<this-project>/` + `~/.claude/history.jsonl`. Default window: the last 2 weeks.

3. **Your steer** _(optional — ask once, accept "nothing specific")_ — one input, whose meaning follows the
   target:
   - **Scanning a RUN:** the **symptom you noticed**, in your words — what the agent got wrong, what you had to
     correct, what annoyed you. You were there; don't make the scan re-derive from the artifacts what you can
     just say. _(This is the "you just did X" of the one-sentence outer loop — the tooled version accepts the
     same X.)_
   - **Scanning LOGS:** the **theme you care about** — the kind of work you want to stop doing by hand, a
     quality bar you keep enforcing, a part of the loop that keeps costing you. Without it the scan just ranks
     by frequency, which is not the same as ranking by what matters to you.

   Either way: **you supply the steer, the target supplies the evidence.**

## Steps — keep them literal; this is the fragile part (meta-prompting)

1. **Learn your own capabilities.** Read the agent docs from input 1. Write a short internal list of _this_ agent's
   extension points (rules, skill, hook, subagent, MCP/tool, automation/workflow, whatever the docs describe). Use
   what the docs say — do not assume a fixed set.
2. **Read the target** — branch on what input 2 was:
   - **A RUN:** read the artifacts **in full** — they're small, and the detail is the point. If input 3 named a
     symptom, **start there**: find it in the artifacts and verify it against what actually happened, rather than
     re-deriving from scratch what the user already told you. Then reconstruct the rest of the run: what was
     asked, what the agent did, where it went wrong, where it had to be corrected, what it assumed, what it
     skipped — the named symptom is the entry point, not a blinder. Read the diff last, as evidence rather than
     as the subject.

     **If the run was orchestrated:** reconstruct from the trail first — artifacts and digests, mapping agents
     to stages via the meta files — and open the transcript of **the implicated stage only** (the
     aggregate-don't-ingest rule applies to agent logs too; a five-stage run's full transcripts would drown
     you). Then read the **components that ran** — the skill, hook, or script the symptom implicates — **in
     full: you cannot propose a change to a component you haven't read.**

   - **A WINDOW OF LOGS:** pull out what you actually did — recurring commands, repeated multi-step sequences,
     repeated instructions/corrections, tools reached for, friction/retries. **Aggregate, don't ingest:** logs can
     be huge — prefer the prompt/command-history file over raw transcripts, and reduce with shell tools
     (`jq`/`grep`/`sort | uniq -c`) so only frequencies and representative samples enter your context, never whole
     log files.

   Either way: if you can't locate or parse the target, **ask the user rather than invent.**

3. **Find what to change** — the question differs by target:
   - **RUN (reactive):** for each thing that went wrong or needed correcting, ask **"what in the AI layer would
     have prevented this?"** Name the **smallest durable change** that would have caught it — a line in a rule, a
     step added to a skill, a hook, a tighter tool scope — specific enough to apply today. **Attribute before
     proposing:** name the component the failure actually lives in — a skill's wording, a hook's guard, a
     script's bound, a reviewer's question set — and quote the lines you'd change. And when a stage missed the
     _mark_ rather than failed mechanically, check what context it was **given**: **the fix is often a missing
     reference or product-direction document, not a rule.** **Fix the system, not
     the code:** do not propose the code fix, propose the thing that would have made the code fix unnecessary or
     automatic. ⚠️ **Not every failure is a system gap** — if something went wrong that no durable change would
     have prevented, say so plainly instead of inventing a rule for a one-off. One honest "nothing to change here"
     is worth more than five speculative rules.
   - **LOGS (proactive):** for each recurring pattern, ask **"what should this become?"** Rank by roughly (how
     often it occurs × how much encoding it would save).

   **Both targets:** pick the **best-fit primitive** (from step 1's list) and say _why_. If input 3 was given,
   **weight it** — on a run, the named symptom's prevention leads the report (and if the evidence says the symptom
   was actually something else, say so plainly); on logs, surface what the user said they care about even when it
   isn't the most frequent pattern, and say plainly when a high-frequency pattern is _not_ worth encoding. And propose each change **in the house style of
   the artifacts that already exist**: skim a couple of the project's current rules, skills and agents first
   (`CLAUDE.md`, `.claude/rules/**`, `.claude/skills/*`, `.claude/agents/story-*.md`), and shape the recommendation
   to look like them, so what it suggests is something the user would actually build. Examples of the mapping:
   - a rule you keep restating → **rules** (`CLAUDE.md`, or a path-scoped file in `.claude/rules/`)
   - a repeated multi-step workflow → a **skill** (`.claude/skills/<name>/SKILL.md`)
   - a must-never / must-always you keep enforcing by hand → a **hook** (`.claude/settings.json`, like
     `guard-commands.mjs`)
   - a specialized recurring delegation → a **subagent** (`.claude/agents/`)
   - a clean end-to-end hand-off you do often → an **automation** (a command, or a CI workflow)

4. **Write the report** as a single self-contained HTML file at `.claude/reports/ai-layer-scan-<YYYY-MM-DD>.html`
   (gitignored, like the other local reports; see the contract below), then tell the user where it is.

## Report contract — prescribe HOW to render, never WHAT to include

**Let the analysis drive the report.** Which sections exist, what goes in them, how deep each goes, how many
opportunities, which quotes or numbers are worth pulling out — all of that comes from what you actually found, NOT
from this skill. Do **not** box the report into a fixed set of sections, do **not** seed findings, do **not** tell
it what to conclude. If the data is rich, the report is rich; if a single finding deserves its own deep section,
give it one; if something surprising turns up, surface it.

Only the **rendering** is prescribed:

- One **self-contained `.html`** file (inline CSS), opens in any browser.
- **Visually clean, scannable, and generous** — let the findings breathe; use whatever layout, sections, real
  quotes, stats, or visuals best fit what was actually found.

The rule: this skill governs _how to put it on the page_, never _what goes on the page_.

## Keep it light

Do exactly these four steps, clearly. Don't add scoring frameworks, config, or extra passes it doesn't need. If a
step can't complete (docs or the target not found), stop and ask — never fabricate the analysis.
**Scan one target per run.** If someone wants both the reactive and the proactive view, that's two runs and two
reports — mixing "what broke in this loop" with "what I keep repeating across a month" produces a report that
answers neither question well.
