# B — "Apartado", refinamiento: the deliberate `i`

The owner read a lowercase **i** in the counters. This round makes it intentional: the upper counter is now a true circular tittle, the ribbon is its stem, and both sit on one shared vertical axis (they were left-aligned but off-axis by 4 units before, which is why the i was legible but accidental).

**Reference measured, not guessed.** Hanken Grotesk 600 was probed at the pixel level: cap 0.70em, stem/cap 0.164, bars/stem 0.91, and its lowercase **i** is tittle ⌀24 / stem w22 / gap 17 — i.e. **tittle = 1.09× stem, gap = 0.77× stem**. The v1 counter-i is built to those ratios. My existing stroke system already matched Hanken (stem/cap 0.167, bars/stem 0.917), so no reweighting was needed.

**Route (b) shipped, route (a) rejected — for v1.** Both were built and rendered head to head.
- **(b) slim/linearise the bottom (SHIPPED):** ribbon narrowed to 17w×23h, tittle ⌀16 — tittle/stem ≈ 0.94, near Hanken's 1.09. The i is unmistakable, *and* the narrower ribbon is more bookmark-like, so the two readings reinforce instead of competing.
- **(a) bolden the top (REJECTED):** small ⌀14 tittle over a 24-wide ribbon. It buys a better-proportioned letter B (0.68 vs 0.57 cap-width) but the tittle/stem ratio falls to 0.58 — it reads as "a dot above a banner", not an i, and the square ribbon loses the bookmark. It also forces the tittle off the stem's inner edge, thickening the B's upper-left mass.

**The governing constraint (worth knowing before anyone asks for a wider B):** a *proportional* counter-i has a fixed vertical cost — topbar + ⌀ + gap + stem-height + bottombar = cap. With Hanken's ratios that solves to a counter ≤ ~17 units, which caps the whole B at **≈0.57–0.61 cap-width**. Hanken's own B is 0.729. **You cannot have both a proportional counter-i and a text-proportioned B.** That is precisely why v1 and v2 carry different marks rather than one shared one.

**v2 therefore uses route (a) geometry**, widened to 0.694 cap-width so it can sit inside a Hanken word (Hanken 0.729 — within 5%). Cap height, stroke weight and bar weight are matched to Hanken 600 exactly; the B→o gap is set to Hanken's own natural 0.068em, then opened ~0.02em because round-bowl-to-round-o needs more air than Hanken's flatter B does.

**v2 naming risk (owner is aware):** the lockup reads **"Bookit"**. The `i` exists only as negative space, so in any context where the mark is absent, monochrome-collapsed, or read aloud, the name loses its first letter. It also breaks the identity doc's rule that the i/B seam must never blur. v1 keeps the seam explicit with a real capital B.

**Guarded from last round:** the right profile is still two true bowl curves meeting at a waist joint — not smoothed (which reads D) and not collapsed. Bars 10–11, stem 12, ribbon apex blunted r2.5 and tail tips r1 so nothing renders as a needle.

**Small-size behaviour, rasterised at true 16/24/32px (not estimated):** the swallowtail survives from **24px up**. At 16px it flattens, but both counters stay open and separate, so the mark degrades to a B whose negative space is still a dot above a bar — the i survives even where the bookmark doesn't. That is the right order of failure: the letter never breaks, and the two readings die in sequence rather than together.

**Known weaknesses:** v1's B is narrow (0.57) and reads slightly condensed beside a wide wordmark — the price of the proportional i. v2's tittle is small (0.65× ribbon) so its i-read is weaker than v1's by design, and its ribbon is nearly square rather than portrait. Wordmarks are live `<text>`; convert to outlines and re-measure viewBoxes when Hanken is embedded for production.
