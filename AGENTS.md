<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Architecture

This repo follows a **sector-first** structure. **Read `ARCHITECTURE.md` first** —
it is the map (sectors, the enforced dependency arrow, and "where do I add X?").
Domain vocabulary is in `CONTEXT.md`; locked decisions are in `docs/adr/`.
The boundary `src/domain` + `src/lib` ✗→ `src/components` + `src/app` is enforced
by `.dependency-cruiser.cjs` and runs on every commit (`pnpm lint`).

**Hooks:** the pre-commit hook (Husky v9) runs `pnpm lint`. Never run `husky`
with an argument (e.g. `husky --version`) — v9 treats the argument as the hooks
path and corrupts git's `core.hooksPath`. `pnpm install` (the `prepare` script)
sets it correctly to `.husky/_`.
