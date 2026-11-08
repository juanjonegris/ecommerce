# Archive — historical harness material

Nothing in this folder is an active rule. Claude Code never loads it automatically, and agents should not treat it as current guidance: paths, versions, and conventions in here may be stale.

| Path                                    | What it is                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| `module-prompts/`                       | The `/planning` input prompts used to generate each domain module (all built).     |
| `docs/ai-coding-project-setup-guide.md` | The original step-by-step setup guide the project was scaffolded from.             |
| `docs/commands.creation-references.md`  | Course notes the `.claude/commands/` files were derived from.                      |
| `docs/*.png`, `docs/*.jpg`              | Screenshots of errors hit during setup.                                            |
| `CLAUDE.pre-rules-migration.md`         | The 617-line root `CLAUDE.md` before it was split into `.claude/rules/` (2026-11). |

Active guidance lives in `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, and `.claude/commands/`.
Executed feature plans stay in `.claude/plans/` because `/planning`, `/execute`, and `/prime-codebase` read and write there.
