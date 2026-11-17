# Delegated work

- **The prompt is the story folder path, nothing else.** The subagent reads `SPEC.md`, `PLAN.md`, `LOGS.md` and `refs/` itself. The dispatcher never summarizes the conversation or explains anything on the user's behalf.
- **Dispatch with the Agent tool**, with `subagent_type` set to the subagent's `name`: `story-architect`, `story-implementer` or `story-reviewer`. Each subagent reads the workflow's shared files from `.claude/shared/story/`, relative to the project root, so nothing else needs to be passed.

Subagents can't talk to the user, so **Stop and ask** in [`rules.md`](./rules.md) becomes a loop:

1. The subagent hits something it would normally ask about. It stops and returns its questions, each tagged with the change-entry type the answer would be (`decision`, `deviation`, `scope-change`) — result status `needs-input`.
2. The dispatcher logs a `/story-<command> paused` command entry, then asks the questions one at a time. A question that offers options is asked with the `AskUserQuestion` tool: each option is a choice, and the recommended option comes first, labeled "(Recommended)". Any other question is asked in plain text.
3. After each answer, if it contradicts `SPEC.md` or `PLAN.md`, the dispatcher updates that file per **Artifact ownership** in `rules.md`. Then it appends a change entry recording the answer (`Trigger: user-request`, the tagged type, `What:` the answer as a one-line decision).
4. The dispatcher re-dispatches with the same prompt. The subagent finds the answers in `LOGS.md`, where they belong anyway.

If the user can't answer a question yet because it needs something outside the story workflow, such as an approval, log that answer with a `What:` starting `not-answered-yet:`, keep asking the remaining questions, and don't re-dispatch. Hand off as paused, with `Next:` naming what the user needs to do, then the command to re-run. On that re-run, before re-dispatching, ask again every question with a `not-answered-yet:` answer since the last `paused` entry and no later answer — done by the user, plan changed, or still blocked — and log the new answer.

## Handling the result

First check the subagent's result against every rule in [`the result format`](./result-format.md).

- **`complete`** — write the artifact block verbatim to the story folder, then append `/story-<command> completed` per [`the logs format`](./logs-format.md), copying the result's fields and adding `Next step:`.
- **`needs-input`** — run the loop above: append `/story-<command> paused` copying the result's fields verbatim, ask the `### Questions` one at a time in the order returned (reword if it reads better, but never answer, soften, or drop one, and name who does each thing: you or the agent), log each answer, then re-dispatch.
- **`error`, or a malformed result** — write no artifact, append `/story-<command> failed`, and hand off as failed. If the result was malformed, offer to show the raw response.

Then hand off per the result format.
