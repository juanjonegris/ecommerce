# Validation

`/story-validate` runs the project's gates against a story's code and records the result in the story's `VALIDATION.md`. `/story-review` and the `story-reviewer` subagent read that record: a review needs a **current validation**, and only a passing one can end in `approved`. Validation results and gate results are defined in [`vocabulary.md`](./vocabulary.md).

---

## Gates

The gates mirror the jobs in `.github/workflows/ci.yml`, the checks a pull request must pass. Use these names and commands exactly; never restate a gate from memory. **If you change a CI job, update this table in the same change.**

| #   | Gate         | Command                          | CI job                 |
| --- | ------------ | -------------------------------- | ---------------------- |
| 1   | Install      | `pnpm install --frozen-lockfile` | every job's first step |
| 2   | Format check | `pnpm format:check`              | `lint`                 |
| 3   | Lint         | `pnpm lint`                      | `lint`                 |
| 4   | Typecheck    | `pnpm typecheck`                 | `typecheck`            |
| 5   | Test         | `pnpm test`                      | `test`                 |
| 6   | Build        | `pnpm build`                     | `build`                |

Not run here:

- **E2E** (the `e2e` job, `pnpm --filter @repo/web test:e2e`): it needs Docker, a seeded database and the api and web servers running. Run it on demand.
- **The Docker production build** (`docker compose -f docker-compose.prod.yml build`): run it before a deploy.
- **The rules drift check:** `/story-retro` runs it.

Run the gates one at a time, in the order above, and stop at the first failure. Never fix anything: the gates change no tracked files (`install` writes `node_modules`, and `build` writes `dist/` and `.next/`, all gitignored).

Run each gate in its own Bash call, writing its output to a temp file so a passing gate's output stays out of the context:

```sh
log=$(mktemp); start=$(date +%s); <command> >"$log" 2>&1; code=$?; echo "exit=$code elapsed=$(( $(date +%s) - start ))s"; tail -n 15 "$log"
```

On a non-zero exit:

1. Read `"$log"`, taking every line that names a `file:line` (`grep -nE ':[0-9]+'`), plus the last 60 lines, at most 200 lines in total.
2. Record the gate as `fail`.
3. Record every later gate as `not-run`, and stop.

---

## Fingerprint

The fingerprint identifies the code a validation ran against. Compute it with the Bash tool (POSIX):

```sh
cd "$(git rev-parse --show-toplevel)" || exit 1
base=$(git merge-base HEAD "$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null)" 2>/dev/null) || base=$(git rev-parse HEAD)
untracked=$(git ls-files --others --exclude-standard -- . ':(exclude).agents/stories')
{
  echo "$base"
  git diff "$base" --binary -- . ':(exclude).agents/stories'
  printf '%s\n' "$untracked"
  if [ -n "$untracked" ]; then printf '%s\n' "$untracked" | git hash-object --stdin-paths; fi
} | git hash-object --stdin
```

- **What it hashes:** everything changed since the base, committed, uncommitted and untracked, except story artifacts in `.agents/stories/`.
- **Read-only:** `git hash-object` without `-w` writes nothing.
- **Content-based:** committing doesn't change it; editing, adding or rebasing does.
- **No base:** if `git symbolic-ref` fails, `HEAD` is the base. Validation and review run on the same machine, so the fallback stays consistent.

---

## `VALIDATION.md` format

`/story-validate` rewrites it on every run.

````markdown
# VALIDATION — <feature-name>

## Run

- Date: <YYYY-MM-DD HH:MM:SS, from the shell>
- Commit: <git rev-parse --short HEAD>
- Fingerprint: <40-hex from the fingerprint command>
- Result: <passed | failed>

## Gates

| #   | Gate   | Command     | Result                        | Time         |
| --- | ------ | ----------- | ----------------------------- | ------------ |
| 1   | <gate> | `<command>` | <`pass`, `fail` or `not-run`> | <n>s, or `—` |

## Failure

- Gate: <gate name> — `<command>` — exit <code>
- Points at: <comma-separated `file:line` taken from the output, or `none`>

```text
<output excerpt: every line naming a file:line, plus the tail, at most 200 lines>
```

## Not run here

- Rules drift check — runs in `/story-retro`
- E2E and the Docker production build — run on demand
````

- The **Gates** table lists every gate from **Gates** above, in that order, with its name and command copied from there.
- `## Failure` is present only when `Result` is `failed`.

---

## Current validation

A validation is **current** when all of these hold:

1. `VALIDATION.md` exists in the story folder.
2. `LOGS.md` has a `/story-validate completed` entry after the last `/story-implement completed` and after the last `/story-fix completed`.
3. `VALIDATION.md`'s `Fingerprint` equals the fingerprint command's output now.

It is **passing** only if it is current and its `Result` is `passed`. When it isn't current, name the first check that failed: `no VALIDATION.md`, `validation older than the last implement or fix`, or `fingerprint mismatch`.
