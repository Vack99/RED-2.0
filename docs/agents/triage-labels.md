# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | **`hitl`**           | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

## Why `ready-for-human` is `hitl` here

This repo has always called that role `hitl` — "human-in-the-loop: needs human action/decision; excluded from the autonomous (AFK) queue". It is the label on every exit-gate issue (#35, #63, #88). Skills apply `hitl`, not `ready-for-human`; do not create a second label for the same role.

`needs-triage` and `needs-info` exist for `/triage` but see little use: this is a solo repo with no inbound reports from strangers.

Edit the right-hand column to match whatever vocabulary you actually use.
