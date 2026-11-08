#!/usr/bin/env node
// PreToolUse guard for Bash and PowerShell tool calls.
// - Blocks `prisma migrate dev` unless `--create-only` is passed: the
//   Product.searchVector GENERATED column makes `migrate dev` emit a broken
//   migration on every run (see .claude/rules/data/prisma.md).
// - Warns (does not block) on `pnpm --filter <pkg> dev|build|lint|typecheck|start`,
//   which bypasses turbo's ^build and crashes on a missing @repo/types dist/.
import { readFileSync } from 'node:fs';

function emit(output) {
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...output } }),
  );
  process.exit(0);
}

let command = '';
try {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  command = String(input?.tool_input?.command ?? '');
} catch {
  process.exit(0); // unreadable input: no decision, normal permission flow
}

if (/prisma(?:\.cmd)?\s+migrate\s+dev\b/.test(command) && !/--create-only\b/.test(command)) {
  emit({
    permissionDecision: 'deny',
    permissionDecisionReason:
      'Blocked: `prisma migrate dev` generates a broken migration in this repo (Product.searchVector GENERATED column). ' +
      'Apply existing migrations with `pnpm --filter @repo/api prisma:deploy`; create new ones with ' +
      '`pnpm --filter @repo/api prisma:migrate:create -- --name <name>` and follow the schema-migration skill.',
  });
}

if (
  /\bpnpm\s+(?:--filter|-F)[\s=]+\S+\s+(?:run\s+)?(?:dev|build|lint|typecheck|start)\b/.test(
    command,
  )
) {
  emit({
    additionalContext:
      'Warning: `pnpm --filter <pkg> <task>` bypasses turbo, so @repo/types may not be built (ERR_MODULE_NOT_FOUND). ' +
      'Prefer root `pnpm <task>` or `pnpm dev --filter <pkg>`, or run `pnpm build` first.',
  });
}

process.exit(0);
