---
description: Audit every eslint-disable / @ts-ignore / @ts-expect-error / TODO fix type in the repo and produce a triage report.
allowed-tools: Grep, Read, Write, Bash(date:*), Bash(mkdir:*)
---

# Check Ignore Comments: Audit Lint + Type Suppressions

Find every place in the codebase where a safety check has been silenced and produce a structured report so the user can triage which suppressions to **Remove**, **Keep with justification**, or **Refactor**. **Decide nothing — produce the report and stop.** The user reviews and chooses.

## What to search

Search every `*.{ts,tsx,mts,cts}` file in the repo for these patterns:

- `// @ts-ignore`
- `// @ts-expect-error`
- `// @ts-nocheck`
- `// eslint-disable`, `/* eslint-disable`
- `// eslint-disable-next-line`, `// eslint-disable-line`
- `// biome-ignore` _(future-proofing — Biome is not the current linter but is a likely migration target)_
- `// TODO: fix type` _(CLAUDE.md §1's sanctioned escape hatch)_

Use the Grep tool with `output_mode: "content"` and `-n: true` so you have file:line for every hit. Group results per file.

## Report path

Write the report to `.claude/reports/ignore-comments-<YYYY-MM-DD-HHMM>.md`. Get the timestamp with `date +%Y-%m-%d-%H%M`. Create `.claude/reports/` with `mkdir -p` if it doesn't exist.

## Report structure

Top of the file:

```markdown
# Ignore Comments Audit — <YYYY-MM-DD HH:MM>

**Total suppressions:** N across M files
**Status counts:** Remove: X · Keep: Y · Refactor: Z _(your recommendation, not a decision)_

## Summary by file

| File              | Count | Dominant recommendation |
| ----------------- | ----- | ----------------------- |
| `path/to/file.ts` | 3     | Keep                    |
| ...               | ...   | ...                     |
```

Then **one section per suppression** (not per file — each individual comment gets its own row), in the order Grep returned them:

```markdown
### `path/to/file.ts:42`

**Comment:** `// @ts-ignore - upstream lib has incomplete types`

**Surrounding code:**

\`\`\`ts
<3 lines before, the line itself, 3 lines after>
\`\`\`

**Why it exists:** <Inspect the surrounding code and explain what type/lint rule it's silencing and what the underlying issue is. Be specific — "narrowing fails because the upstream type uses `any`" is useful; "TS is wrong" is not.>

**Options to resolve:**

- **A. Remove and address the underlying issue** — effort: <Low/Medium/High>, breaking-change risk: <Low/Medium/High>, impact: <description>.
- **B. Keep with a justification comment** — effort: Low, breaking-change risk: None, impact: <description, e.g., "documents intent for future readers">.
- **C. Refactor to remove the need entirely** — effort: <Low/Medium/High>, breaking-change risk: <Low/Medium/High>, impact: <description>.

**Recommendation:** **Keep with justification** _(or **Remove** / **Refactor**)_ — <one-sentence reason>.
```

## Common patterns to recognize

Recognizing these saves time and improves the recommendation quality:

- **Provider stub files** (`apps/api/src/modules/*/providers/stub.provider.ts`) — interfaces require certain method signatures. Stubs accept params they don't use, triggering `no-unused-vars`. **Usually Keep** with a justification comment like `// stub — required by IProvider interface`.
- **Library types that don't match runtime** — narrow assertion is correct, lib `.d.ts` is wrong. **Usually Keep** until upstream ships fixed types; track via `// @ts-expect-error <issue url>`.
- **Test files mocking globals or accessing private members** — `apps/api/**/*.spec.ts` may need `eslint-disable @typescript-eslint/no-explicit-any` for mock factories. **Usually Keep** but verify against `apps/api/test/factories/` (the canonical factory pattern uses `Partial<T>` instead of `any`).
- **`@ts-ignore` without a comment** — no justification, just a silenced error. **Usually Remove** or convert to `@ts-expect-error` (which fails the build if the underlying issue is fixed — a self-cleaning suppression).
- **`// TODO: fix type`** — sanctioned by CLAUDE.md §1, but the moment it has been there longer than 2 months it usually means "Refactor" not "TODO".
- **`eslint-disable-next-line` with a specific rule** (e.g., `@typescript-eslint/no-unsafe-assignment`) — more defensible than a blanket disable. **Often Keep** if the line genuinely needs the unsafe op (e.g., interop boundary with `JSON.parse(...)`).
- **`eslint-disable` blanket at top of file** — almost always **Refactor**. Blanket disables hide future violations too.

## Output report rules

- Sort the per-suppression sections in **the order Grep returned them** (file then line). This keeps the report stable across runs and easy to diff.
- Use markdown headers (`###`) per suppression so the user can navigate with editor outline.
- **Never modify any source file.** This command is read-only. The report is the deliverable.
- **Never decide.** Each section ends with a **recommendation**, not an instruction. The user triages.

## Stop conditions

Stop after writing the report. Print:

- The report path.
- The summary counts (total suppressions, remove / keep / refactor counts).
- One line of next-step guidance: "Open the report and triage the items marked **Remove** first."

## Skipped from the audit

- `node_modules/` — third-party code, not ours to clean.
- `.next/`, `dist/`, `build/`, `coverage/` — generated output.
- `**/*.d.ts` declaration files — often contain library-style type acrobatics that aren't comparable to suppressions in app code. Audit separately if needed.
- Anything matched by `.gitignore` (these directories are gitignored anyway).

## Notes

- The Grep tool's default `glob: "*.{ts,tsx,mts,cts}"` already excludes the gitignored output dirs because they're outside the workspace's tracked tree.
- For frequent audits, the report directory `.claude/reports/` is gitignored (or should be — flag if it isn't). Reports are local-only artifacts; they're not meant to be committed.
- This command pairs with `/validate` — run `/validate` to verify all gates pass, run `/check-ignore-comments` to see what was silenced to make them pass.
