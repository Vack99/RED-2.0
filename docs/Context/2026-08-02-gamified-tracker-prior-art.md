# Gamified/spatial tracker prior art — and what killed the abandoned ones

> Resolves [#195](https://github.com/Vack99/RED-2.0/issues/195) on map [#191](https://github.com/Vack99/RED-2.0/issues/191). Research only — no code changed, no map edits.

**The question:** does the arcade's game layer (FF6-style world map, fog of war) raise or lower the
cost of understanding the tracker? Two owner constraints are in tension: *"I will not use an ugly
tool"* (2026-07-30) vs *"I take more time understanding the damn thing than actually using it"*
(2026-08-01). Neither has ever been tested against evidence.

---

## 1. MEASURE — what the arcade actually does today

Read `red-tracker/arcade.html` (7662 lines), `red-tracker/HANDOFF-tracker-skins.md`,
`red-tracker/HANDOFF-arcade-175-close-out.md`, `red-tracker/SPEC-panel-arbol.md`,
`red-tracker/NOTES-panel-prototype.md`, and rendered the two prototype screenshots
(`PROTOTYPE-map-overworld.png`, `PROTOTYPE-map-foundation.png`) — no `refresh.mjs`/`gen-arcade.mjs`
run, per instruction.

**The honesty law is real and machine-enforced, not aspirational.** `arcade.html:1090`:
`// HONESTY (T5, non-negotiable): every number below is derived from the viewmodel... a bar's
width is earned/total, so it can never read fuller than [the count]`. `SPEC-panel-arbol.md` §3
restates it as three gated laws: hides are declared with real numbers, counts survive filtering,
empty is stated and never implied. These are mutation-tested (`HANDOFF-arcade-175-close-out.md`:
"21 seeded defects all caught").

**Fog is tied to the real number, and never covers the number itself.** `HANDOFF-arcade-map-153.md`:
"clouds are the fog-of-war... the map reads its true 28% earned"; A8 interior fog is "machine-audited"
to never occlude a tile. In the overworld screenshot, opaque cloud shapes do hide terrain art over
unearned realms, but the `%` and count readout sits in clear text beside/above the cloud regardless —
decoration goes under the fog, data never does.

**The classic gamification failure modes were pre-rejected on day one**, not discovered late.
`docs/superpowers/wayfinder/2026-07-14-T5-visual-language.md` explicitly ruled out XP/points/levels
("rewards grinding, not truth"), streaks ("would punish honest pacing"), badges/achievements
("a second, fake progress signal"), confetti ("reads as AI-generated filler"), and leaderboards
("no one to compare against"). What survived is a spatial visualization of a real number, not a
Habitica-style reward economy. This matters for §3 below — the arcade was never the kind of
gamification Gartner and the academic literature warn about.

**Despite that restraint, the first arcade build failed its own acceptance walk on usefulness, not
beauty.** `HANDOFF-tracker-skins.md` §1/§5.1 (2026-07-30, ranked worst-first): the panel indexed 32
districts instead of 74 quests (structurally could not open an issue); reading was modal — two
issues could never be compared; navigation was coupled to reading (750 ms escort per row, "24s of
pure animation" for a 32-district survey); no project-wide view; no filters; **and `index.html`
(the plain skin) also failed** — "neither skin does the tactical job." This is the load-bearing
finding for this ticket: the first failure was not "the map is the problem," it was "walking is the
price of reading, and nothing indexes the real unit of work" — a rendering defect present in both
skins, not a game-layer defect unique to the map.

**The fix (`SPEC-panel-arbol.md`, owner-picked variant B "ÁRBOL" over A "BANDEJA" and C "TABLERO",
`NOTES-panel-prototype.md`) decoupled walking from reading but kept full spatial road-order** — and
that trade was not free. Measured cost, in the prototype: "8 of Foundation's 10 districts are `1/1
COMPLETO` rows you scroll past before reaching the two with live work." Variant C (ownership-axis
first, map demoted) was explicitly "the only one that admits the map isn't load-bearing for triage"
but was rejected specifically because it broke panel/map agreement — a beauty-adjacent reason, made
consciously, with the cost named in writing rather than discovered later.

**There is no legend or onboarding UI anywhere in `arcade.html`.** Grepped for
legend/leyenda/tutorial/onboarding strings — zero hits outside an unrelated label constant.
Comprehension of fog=unearned / crimson=earned / chain=blocked / torii=beacon-ahead /
boarded=deferred is 100% recall, not recognition.

**The owner already ruled "make it optional" in substance, before this ticket existed.**
`HANDOFF-tracker-skins.md` §4, verbatim: *"they both are the tracker... I wanted a tracker with a
different skin, for whenever I want to use a different skin I can do so... The trophy is the
project, not the tracker."* Two skins already exist over one `status.js`; neither is canonical.

**Cost of doing nothing, for scale** (`docs/Context/2026-07-30-tracker-usefulness-cross-examination.md`
§9): 17 open issues fit on one screen; the tracker being "broken" cost nothing measurable this month
(68 issues shipped, 162/179 closed, five releases in 15 days). Any fix here is a comprehension-cost
fix, not a throughput fix — that's the correct frame for ranking options below.

---

## 2. RESEARCH — the four required angles

### 2.1 The standard

There is no named standard for "gamified progress tracker" as a category — it's a design pattern,
not a discipline. But two adjacent standards bear directly on the mechanism question:

- **Information radiators** (Alistair Cockburn, 2001; "Big Visible Chart," Kent Beck, *Extreme
  Programming Explained*) — the established software-team pattern for ambient, glanceable status
  display. Its defining property: the display is **always-on and requires no interaction to read**
  — you don't open it, you walk past it. CI build radiators and physical kanban boards are both
  instances of this standard.
- **Nielsen's usability heuristic #6, "recognition rather than recall"** (NN/g) — reduce what a user
  must remember by keeping the cue visible in the artifact itself. The practitioner counter-pattern
  is stated directly in the dataviz literature on chartjunk: "avoid unnecessary legends by
  incorporating labels directly into the visualization" rather than requiring the reader to hold a
  key in their head.

Neither standard forbids spatial or pictorial encoding. Both forbid **requiring a separately-learned
key** to decode what's on screen. That is the actual bar the arcade's legend-free requirement
should be measured against, not "is it a game."

### 2.2 The incumbent

**GitHub's own Issues/Projects UI** — zero legend (a card in "Done" means done), millions of people
already carry the vocabulary, zero build cost. Ranked honestly: it wins outright on comprehension
cost and wins on "already exists," and it is not a close call on the owner's aesthetic constraint —
it fails "I will not use an ugly tool" by design (it is a generic SaaS kanban board). The owner has
already rejected it twice in practice by commissioning two bespoke skins (`index.html`, then
`arcade.html`) rather than pointing `track.bat` at `github.com/.../issues`. Recorded here so the
incumbent isn't silently assumed inferior: it is the honest floor every custom skin is spending
effort to beat, and per §1's "cost of doing nothing," at n=17 open issues the incumbent alone would
likely have been sufficient on throughput grounds. It loses only on the constraint that is explicitly
non-negotiable.

### 2.3 Prior art and its post-mortems (loved vs. abandoned, novelty decay specifically)

| Prior art | Survived / abandoned | What the post-mortem says | Mechanism |
|---|---|---|---|
| **Habitica** | Most users drift away within ~12 months despite genuinely enjoying it | HP-loss and party-pressure mechanics documented turning missed habits into anxiety triggers ("bullied out of a party for not wanting to join a challenge due to my mental health"); RPG onboarding (class/equipment/party) costs comprehension *before* a single habit is tracked | Extrinsic-reward layer becomes its own dopamine loop, separate from the real behavior — classic overjustification effect. Also a direct hit on this ticket's brief: the RPG layer *is* a comprehension tax paid before any use. |
| **Duolingo streaks** | Survived and is Duolingo's signature retention lever, but internally controversial | Loss aversion drives daily return, but "streak anxiety, compulsive checking" and rage-quit-on-first-miss are documented; the product had to bolt on streak freezes/grace periods after shipping to survive its own mechanic | The number (days) decouples from the truth it represents (learning); once the number itself becomes the goal, the product must spend engineering defending the number, not the truth |
| **GitHub contribution graph** | Survived years, but trust in it as a *signal* has been publicly and repeatedly debunked | "An entire shadow industry" of commit-backdating exists purely to keep squares green; practitioners now openly say the graph "means absolutely nothing" as a competence signal | The clearest case in this table of "gamified progress signal invites over-claiming, and that is exactly what kills trust in it" |
| **Todoist Karma** | Still shipped, opt-outable | Independent analysis (Q1 2024 usage data) found karma-enabled users had *identical* completion rates but 12% more duplicate entries ("point-farming") and slightly higher abandonment | A small, measured instance of the same failure: the moment a number is gameable independent of the ground truth, some fraction of users games it instead of doing the work |
| **Nike Run Club** | One of gamification's actual retention wins — 30% higher retention vs. non-app users | Mechanism is instructive: competition against your *own past self*, and the tracked unit (distance, pace) *is* the real-world unit — there is no invented abstraction layered on top | Structurally close to this project's honesty law: there is no daylight between "the game number" and "the real number," so there's nothing to over-claim |
| **Burndown charts** | Standard in Scrum, but widely criticized inside the discipline itself | The documented "hockey stick" anti-pattern (flat until day 8, cliff at day 10) and the literature's own conclusion — "if a smooth burndown is what's desired, that's what you'll get," via premature closes and sandbagged estimates | Same over-claiming risk as the GitHub graph, inside project management specifically; many teams responded by preferring the plain kanban board's left-to-right flow, which is harder to fake than a derived chart |
| **Toyota andon board / physical kanban** | Decades of continuous real use, survives despite fully digital alternatives existing | Plants with visual management report materially lower defect-escape rates; teams keep physical boards specifically for being "always on" — you can't tab away from a wall | The visualization **is** the state (card position = status, light color = stop/go) rather than a derived report of it — nothing to decode, nothing to fake |
| **RPG-styled todo apps generally** (Habitica-adjacent) | Category-wide novelty-effect pattern | Documented across gamified-learning literature: high activity in weeks 1–3, drop-off once novelty wears off, occasionally a "familiarization" rebound if intrinsic value survives the RPG skin | Novelty decay is real and dated (~2-4 weeks), and the field's own fix is shifting weight off the game layer onto genuine utility once the novelty window closes — not adding more game |
| **CI dashboards as landscapes / build radiators** | Common and durable in dev teams | No abandonment literature found — because they inherit the information-radiator property (glance, don't open) and never invent a number; they visualize pass/fail, which is already binary and already true | Confirms §2.1's standard: spatial/pictorial skin is fine when it never adds a fabricated metric underneath |

**Novelty-decay verdict:** every abandoned example in this table (Habitica subset, RPG todo apps,
gamified-learning systems generally) decayed on the same axis — a reward layer *invented a number
that wasn't the real thing*, and once the dopamine of the invented number faded, using the tool cost
more than the invented number was worth. The arcade's map does not invent a number; it renders the
real `earned/total`. That is the single biggest reason it does not automatically inherit Habitica's
failure mode — but it does not automatically inherit Nike Run Club's success either, because unlike
running (where distance was always going to be tracked), **reading the map is an added step**
between the owner and the number, not the number's native format. Whether that added step pays for
itself is exactly what §1's own post-mortem already measured: yes for the honesty law, not yet for
navigation-coupled-to-reading (partially fixed) and road-order-over-urgency-order (still an open
cost, ruled deliberately, not by oversight).

### 2.4 Own prior art — what already works for this exact job

Restated from §1 because the skill requires ranking it, not just recording it: the honesty law
(gated, mutation-tested, "a filter may never make a bar read fuller") is a stronger defense against
the failure mode that killed trust in the GitHub graph, Todoist Karma, and burndown charts than any
external prior-art example reviewed has. None of Habitica, Duolingo, the GitHub graph, or Todoist
enforce their number with a machine gate; this project already does. That is real, working, owned
infrastructure and the strongest asset on the "keep some visual signal" side of this ledger.

Conversely, the project's own `NOTES-panel-prototype.md` variant comparison is the strongest asset
on the "the map imposes a real, measured cost" side: variant C, which demoted the map, was the
*only* variant that admitted "the map isn't load-bearing for triage" — an admission made by this
project's own design process, not inferred from outside research.

---

## 3. Mechanism question — when does the metaphor help, when does it cost

**Helps** when spatial position *is* the data rather than a re-encoding of it. Kanban column,
Toyota andon light, and (per the neuroscience) the method of loci all share this: the hippocampus's
spatial system is genuinely one of the most robust human memory systems — but method of loci only
works because the *space itself* is already memorized before it's pressed into service (a familiar
childhood house). A brand-new fantasy world map is the opposite precondition: the owner must
memorize the space **and** use it for new content in the same sitting, which is closer to recall
than recognition — the thing NN/g's heuristic #6 says costs more.

**Costs** when the metaphor requires a learned key: fog=unearned, crimson=earned, chain=blocked,
torii=beacon-ahead, boarded=deferred is five bespoke symbols with no legend anywhere in the file,
audited in §1. It also costs when walking through the space is priced onto reading it — measured
directly in this project (750 ms/row, 24s for a district survey) before the ÁRBOL fix decoupled the
two. And it costs when the spatial order is kept even though it doesn't match the order the question
is actually asked in ("what's next" vs. road order) — also measured directly in this project
(COMPLETO rows scrolled past in Foundation).

**Fog of war specifically — unexplored, or hidden from me?** The standard convention (Civilization
and RTS games generally) distinguishes two states: solid-black "never seen" vs. grey "seen before,
now stale" — and mechanically fog represents the *player's own* vision limit (I haven't sent a
scout there yet), not the system withholding data adversarially. That reads as "unexplored," and
it's an honest transfer **only if the number is never actually concealed** — which is the one
condition that has to hold for the metaphor to avoid feeling like concealment. The arcade satisfies
it (§1: fog covers decoration, never the `%` readout), so on the specific fog-of-war question, the
arcade is using the metaphor correctly, matching the standard convention, not violating it.

---

## 4. Honesty — do gamified tools generally over-claim, and is that why they stop being trusted

Yes, converging across every case in §2.3 that lost trust: the GitHub graph (backdated commits),
Todoist Karma (duplicate-entry farming), and burndown charts (hockey-stick gaming) all share one
structural cause — **the displayed number is a separate, independently-updatable artifact from the
ground truth**, so there is slack for a person or process to close the gap by pushing on the display
instead of the reality. Duolingo's streak is the same family by a different mechanism: the number
(days) survives even when the truth it's supposed to represent (learning) doesn't, so preserving the
streak becomes a goal that can displace the real one. Nike Run Club and the Toyota andon board are
the counter-cases, and both work the same way: there is no separate number to game because the
display *is* the real-world unit, not a derived score.

This project's honesty law is a direct, working answer to the exact failure mode above: the bar is
computed from the viewmodel, cannot be hand-set, cannot be inflated by a filter, and is mutation-gated
so a regression is machine-caught. Judged against every prior-art post-mortem in this document, that
is the correct fix, already built, already enforced — the honesty side of this tension is close to
resolved. The comprehension side is not: nothing in the honesty law reduces how many symbols must be
memorized to read the map.

---

## 5. Ruling — direct recommendation

**Make the game layer optional — formalize what the owner has already ruled, and keep shrinking the
legend inside it. Do not remove the map; do not leave it as the forced first read.**

Evidence, ranked:

1. **The owner already ruled this**, in writing, before this ticket existed (`HANDOFF-tracker-skins.md`
   §4, 2026-07-30): two skins over one tracker, neither primary, neither decorative, "for whenever I
   want to use a different skin I can do so." This ticket's job was to test that ruling against
   evidence, not invent a new one — and the evidence supports it rather than overturning it.
2. **The measured failure was never "the map exists," it was "walking is the price of reading, and
   nothing indexes the real unit of work"** — present in *both* skins at first ship, not unique to
   the spatial layer (§1). That defect is substantially fixed (ÁRBOL decouples walking from reading);
   the map's existence was not the defect being fixed.
3. **External prior art draws the line at invented numbers, not at spatial skins.** Every abandoned
   or trust-eroded example in §2.3 (Habitica's RPG layer, the GitHub graph, Todoist Karma, burndown
   charts) failed by adding a number that could drift from the truth. The arcade's map renders the
   real number and cannot inflate it (§1, §4) — it does not have that failure mode, so "reduce the
   game layer" is not supported as urgently as the brief assumed going in.
4. **What the evidence does support reducing:** the five-symbol legend with zero in-app aid (fog,
   crimson, chain, torii, boarded — §1, §3) and the road-order-over-urgency-order cost paid for
   panel/map agreement (§1, §2.4) are real, measured, still-open comprehension taxes, independent of
   whether the map exists at all. Shrink the legend (fewer bespoke states, or an always-visible key)
   and keep the ownership-axis question ("what's next") one click closer than geography — that is
   the reduce-not-remove half of this recommendation.
5. **Fog of war itself is not the problem** — it matches the standard convention and never conceals
   the honest number (§3). Do not spend effort replacing it; spend effort on the legend and the
   panel default, both already identified as open costs by this project's own prior sessions.

Not resolved by this ticket, and stated rather than guessed: whether the *default* skin `track.bat`
opens should flip from arcade to the plain/filterable one is a RULE, not a RESEARCH question — it
belongs on map #191 with the owner holding this evidence, not decided here.
