# Execution session prompt · recibo cycle (#96 → #97–#103)

> Paste the block below into a fresh session **already inside the worktree**
> (`.claude/worktrees/recibo-email-brand`, branch `recibo-email-brand`).
> Everything above the rule is meta; everything below it is the prompt.

---

Execute the full recibo cycle — spec #96, tickets #97 → #103, first to last, in one run.

**Read these two files before anything else. They are the whole input:**

- `docs/superpowers/handoffs/2026-07-13-recibo-delivery-and-brand-kickoff.md` — the detailed reference:
  root causes (all proven against the live DB), the exact mechanisms, the gotchas, the gates.
- Spec #96 on GitHub (`gh issue view 96`) — the locked decisions, testing decisions, and out-of-scope list.

Then read the seven tickets: `gh issue view 97` … `gh issue view 103`.

## Ground truth about the workspace (verified 2026-07-13, trust this over any line numbers in the kickoff)

- The receipt card is `apps/admin/src/app/(app)/vender/_components/recibo.tsx` — it **moved** into
  `_components/` after the kickoff was written, so every `recibo.tsx:NN` line cite in that doc has drifted.
  Re-anchor by symbol, not by line.
- **The branch is based on a stale `main`.** `recibo-email-brand` descends from `red-brand-polish` (9894cb7),
  which diverged from `main` at 6514665. `main` has since gained c48644b ("scope the dashboard + ficha-nav
  reads"). There is **no file overlap** with this cycle's targets (c48644b touched `resumen.ts`,
  `roster-nav.ts`, `cuenta.tsx`; #97 touches `perfil.ts`, `gym.ts`, `ventas.ts`, `clientes.ts`), so the
  rebase should be clean. **Rebase onto `main` as step 0**, before writing any code — otherwise the final
  fast-forward is not a fast-forward.
- Shipping this cycle to `main` will **carry 9894cb7** (the unmerged RED logo/mark work) with it. That is
  expected; do not try to separate them.
- **No font binary is committed anywhere in the repo.** `git ls-files | grep -E '\.(ttf|otf|woff)$'` is empty.
  #100 needs an Outfit `.ttf` (ImageResponse takes `ttf`/`otf`/`woff` — *not* woff2, and `next/font/google`
  exposes no `ArrayBuffer`). Sourcing and committing that binary is a real, unstarted task — surface it early,
  do not discover it at the end.
- Baseline is gate-green and deps are installed. Confirm with `pnpm test` before you start changing things,
  so you can tell your breakage from pre-existing breakage.

## Orchestration approach

The dependency graph is mostly a chain, and **five of the seven tickets touch `recibo.tsx`** (#98, #99, #101,
#102, #103). Parallel agents on that file would conflict. So: **sequential by default, fan out only where the
work is genuinely disjoint.**

```
#97 (data pkg + migration) ──┬──→ #99 (A1: email body) ──┬──→ #100 (A2: PNG + attachments) ──┐
                             │                           └──→ #101 (A3: resend button)       │
#98 (recibo.tsx, one tuple) ─┴──→ #102 (C1: de-inline colors) ─────────────────────────────┴──→ #103 (C2: RED re-skin) 🔒
```

**Phase 0 — re-anchor (fan out, read-only).** Before writing code, dispatch parallel readers to confirm the
kickoff's claims against the actual tree: the three unscoped `perfil` reads, the `MailTransport` seam and its
existing test prior art in `invitaciones.test.ts`, the sale path's pre-RPC client read, and the receipt card's
inline-color inventory. The kickoff is trustworthy on *mechanism* and stale on *coordinates*. Cheap, and it
stops the whole run from building on drifted line numbers.

**Phase 1 — #97, then #98 (sequential, inline).** #97 is the foundation: it's the only ticket with a migration,
and every downstream item needs the correct gym name. #98 is one tuple and one destructure — parallelizing it
would cost more than doing it. Gate after each.

**Phase 2 — #99 (sequential, inline).** The bulk of the cycle and the highest-judgment work: the ticket-twin
component, `emailCliente` recipient resolution, the send wired as a sibling of the existing invite call.
Do it with full attention; do not delegate it whole.

**Phase 3 — #100 ∥ #101 (fan out, 2 agents).** Both are blocked only by #99 and they touch different files:
#100 is `invitaciones.ts` (attachments) + the twin + the font binary; #101 is `recibo.tsx` (the button). The
only shared surface is the send action, which #99 already froze. Genuinely parallel.

**Phase 4 — #102, then #103 (sequential; #103 is a HITL stop).** #102 is mechanical and must be
byte-identical. #103 is the owner-gated one — see below.

**Phase 5 — adversarial review.** Multi-dimension review of the full diff before it ships: correctness,
tenant-scoping (does any read still miss `gym_id`?), Forge-invariance (is the re-skin provably additive?),
and leanness (the spec's own YAGNI clause — reject single-caller abstractions). Verify findings skeptically
before acting on them; fix what survives.

**Models: opus / sonnet only. No Fable** — owner is explicit, quota is low. Subagents get opus or sonnet.

## The four hard stops — surface all of them early, do not let them ambush the end of the run

1. **🔒 #103 palette pick (owner).** RED crimson on cream has no vetted contrast pairing anywhere in the repo —
   every RED token was computed against RED's near-black canvas. Render candidates at true size on the real
   card, fan them out in parallel, and **stop for the owner to choose. Commit nothing on a guess.** This is
   exactly how the mark got fixed last session.
2. **🔒 The migration gate.** #97 ships DDL (drop `perfil.negocio`'s `DEFAULT 'FORGE'`). Per `AGENTS.md`, a
   migration-bearing change runs **`pnpm test:denial` green against the scratch project** before it
   fast-forwards to `main`. The scratch project is kept and documented at `docs/db-testing-throwaway-project`
   (gitignored creds; ref `gyyujeguycxxoaqgdnjp`). Needs a `SUPABASE_ACCESS_TOKEN`. No `rpc-coverage.json`
   obligation — no RPC writes `perfil`.
3. **🔒 The Supabase MCP is bound to LIVE PRODUCTION.** Do **not** `apply_migration` through it. Read-only
   `SELECT`s are fine. Ask before any write.
4. **🔒 The Outfit `.ttf`.** Not in the repo. #100 is blocked on it. Raise it during Phase 0, not Phase 3.

## Definition of done for the cycle

- All seven tickets' acceptance criteria met and the issues closed.
- Pre-commit gate green throughout (`pnpm lint && pnpm typecheck && pnpm test`).
- `pnpm test:denial` green on the scratch project (the migration gate).
- **Manual walk, both brands:** a real sale on `red-demo` → footer says RED, WhatsApp copy says RED, the email
  arrives with the ticket as its body and the PNG attached, From shows RED. A real sale on `forge-demo` →
  everything still says FORGE and the card is **byte-for-byte unchanged**.
- Forge invariance for #102/#103 proven by curl-diffing the running admin — not by eye, not by "tests pass".
- Rebased on `main`, fast-forwarded to `main` when green. Solo-main workflow: no PR.
