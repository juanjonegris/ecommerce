# Hooks

Hooks run on your tool calls: the project's, the user's, and managed ones. A hook can block a call, ask a person to approve it, or change files after it.

## A blocked call

When a hook blocks a tool call, never reach the same effect another way: another tool, another path, a shell command.

- **The hook says how to comply.** If its message says how (remove the secret, use the required tool, fix the lint error) and complying stays within the plan, or the finding you're fixing, comply and continue without asking.
- **Complying needs a person.** If complying needs an approval, or the work depends on the blocked action, it's a blocking question. Quote the hook's own message — its stderr or deny reason, not the `<event>:<tool> hook error: [<command>]:` prefix around it — and say what approval it asks for, such as a change ticket or a named approver.

An _ask_ that ends without approval, for any reason, is a block.

## After the answer

An answer in `LOGS.md` doesn't open the gate: the same call hits the same hook again. The answer is one of:

- **Done by the user** — the user performed the blocked action, or changed the hook or its permission. Continue from there; don't repeat the action.
- **Hook-defined approval** — the hook's message names a way to pass approval, such as an environment variable or a ticket file, and the answer provides it. Follow it.
- **Plan changed** — `PLAN.md` was updated so the work doesn't need the blocked action. Follow the new plan.
- **Stop** — the user can't resolve it now. Retry nothing; `/story-fix` skips the finding.

## Hooks that change files

A hook that rewrites a file after your edit, such as a formatter, isn't a deviation: don't report its rewrites or redo the edit.
