# T6 — Tracker tech & localhost launch approach

> **Wayfinder asset** · resolves [T6 · Tracker tech & localhost launch approach](https://github.com/Vack99/RED-2.0/issues/111) (#111) on map [#105](https://github.com/Vack99/RED-2.0/issues/105) · 2026-07-14
>
> **What this is:** the decided build/run architecture for the tracker renderer, honouring the split — renderer **outside** RED-2.0, repo untouched except `docs/scope-model.yaml`.

## Decisions at a glance

| Decision | Choice | Why |
|---|---|---|
| **App shape** | **One static `index.html`** (vanilla JS + inline CSS, no framework, no build) | The T5 mock *is* already this shape; a Vite app adds node_modules + build for zero benefit. |
| **Data feed** | **Snapshot file `status.js`** (a `window.STATUS = {…}` assignment), regenerated on demand | Browsers can't shell `gh`; and `fetch("status.json")` is CORS-blocked on `file://` — a `<script src="status.js">` is not. Double-clicking the HTML just works, **no server ever**. |
| **Refresh** | **`refresh.mjs`** (Node, single dep `yaml`) | Reads `../RED-2.0/docs/scope-model.yaml` + **one** `gh issue list --state all --json number,title,state,labels,closedAt --limit 1000` call → writes `status.js` `{ model, issues, generatedAt }`. One API call per refresh. |
| **Derivation** | **All client-side in `index.html`** | Bars (closed/total), auto-status, `status`-override, `blocked`, `shipped-with-open-threads`, "awaiting owner walk", and the **unmapped-issues inbox** all derive in the renderer, next to the code that displays them — the snapshot stays raw facts, so re-deriving never needs a re-fetch. |
| **Folder** | **`C:\Users\Aaron\Documents\Repos\red-tracker`** (sibling of RED-2.0, like `autoskills-library`) | Outside the repo; its own tiny `package.json` (dep: `yaml`) is fine there. |
| **Launch** | **Double-click `track.bat`** (= `node refresh.mjs` then `start index.html`) | One gesture: refresh + open. Stale-tolerant fallback: opening `index.html` directly shows the last snapshot with its `generatedAt` timestamp visible in the header. |

## The renderer contract (seeded from T2, restated)

- Resolve every quest's `github` block against the issue snapshot: explicit numbers, `"N-M"` range strings, and `label:` matches (a labelled open/closed issue auto-joins its quest).
- Bar + auto-status from closed/total (`0→todo`, `some→in-flight`, `all→shipped`); a hand-set `status` overrides the derived label; world/subgroup progress rolls up from quests.
- Derived states, never stored: `shipped-with-open-threads` (shipped ∧ caveats), `blocked` (any `depends_on` target not shipped), "awaiting owner walk" (`kind: gate`, deps shipped, own issue open).
- **Unmapped-issues inbox:** every open repo issue that carries no quest label and appears in no quest's `issues:` renders in an uncategorized pile — nothing filed ever silently vanishes.
- All links constructed from the top-level `repo:` field.

## What was rejected

- **Vite/React app** — build step + deps for a one-page personal dashboard; the dataset is a few hundred quests at most, vanilla renders it instantly.
- **Live `gh` calls from a local server** — a running process, auth in server context, slower loads; a personal tracker wants a deterministic snapshot with a visible timestamp, refreshed by the same gesture that opens it.
- **`status.json` + `npx serve`** — works, but demands a server purely to satisfy CORS; the `status.js` assignment removes the server entirely.

## "In use" check (the map's remaining fog item)

Adoption is verified in the execution tail: the owner (or the verifying agent) runs `track.bat` and the tracker renders live state — real bars, real derived states, a populated (or honestly empty) inbox. The one-line "how to open it" note lands in the owner handoff.
