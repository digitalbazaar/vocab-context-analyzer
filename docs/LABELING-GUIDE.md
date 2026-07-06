# Golden-Set Labeling Guide

**Audience:** the engineer labeling the Phase 2 eval golden set (design doc
`PHASE2-EVAL-GATE.md` §2.2, build-order step 4). **Status:** ready to use.

The Phase 2 LLM layer will be measured against a human-labeled standard. This
guide is how that standard is produced: for each golden-set case you assign an
overall verdict, a rank within its cohort, and any term-level subjective
issues. The deterministic rules already catch objective defects — **your job
is the layer they cannot reach** (naming, definitions, modeling, coverage
judgment).

## The labeling app

```
npm run label:app
```

Then open <http://127.0.0.1:8642>. The app shows each case's raw JSON-LD
documents (with a flattened term-summary toggle) on the left and the labeling
form on the right; a "how this works" drawer explains the screen. Everything
autosaves to `test/fixtures/golden/labels.json` in your checkout; quit and
relaunch anytime and your work resumes.

**Cases are blinded on purpose.** You see anonymous ids (`case-07`,
`cohort-2`), not fixture names, so nothing about a case's origin can influence
your judgment. Judge only the content.

## What you label

### overall — `good` | `bad` | `borderline`

Your holistic verdict on whether this vocabulary/context is well designed,
counting everything — the rule-caught findings shown above the form are part
of the picture and can make a case bad on their own. `borderline` is a real
answer for genuinely debatable cases — it is **not** a way to avoid deciding
(see No-Deferral below), and it needs at least one subjective issue explaining
the tension. Click a selected verdict again to unset it.

### designRank — an ordinal within the case's cohort

Use the **rank** button on a cohort header and drag the cases into order:
**rank 1 = best design**, dense ranks, no ties (the app derives the numbers
from your drag-order). Ranking only makes sense within a comparable group —
cohort assignments live in `test/fixtures/golden/cohorts.json`. This drives a
rank-correlation metric, so consistency within the cohort matters more than
absolute positions.

### subjective issues — term-level problems the rules cannot catch

One row per issue: pick the term (a dropdown of the case's real IRIs), a
category, and write a note.

| category | What it covers | Example note |
| --- | --- | --- |
| `naming` | Clarity, consistency, idiom of a term name | "verb-phrase predicate, inconsistent with noun siblings" |
| `definition` | Is the definition informative, or boilerplate/circular? | "comment restates the label, says nothing about semantics" |
| `modeling` | Granularity, subclassing, Thing-vs-bag-of-JSON | "a printable flag on Person models a document concern as a person attribute" |
| `coverage` | Conceptual gaps — an obvious attribute the vocab gives no way to express | "no property for a Person's birth date, though the domain needs it" |

## Rules (non-negotiable)

- **No deferrals.** (SPEC §5.2.1.) A note like "needs expert input", "it
  depends", or a bare "consider X" with no rationale is a **failed label**,
  not a cautious one — this set is the standard the model is judged against,
  so it must commit. Genuine uncertainty is `overall: borderline` plus an
  issue explaining the tension — never an empty label.
- **Every note must be actionable.** State what is wrong and, where possible,
  what would fix it. "Bad name" is not enough; "rename to a noun to match its
  siblings" is.
- **Stay in your lane — subjective only.** The findings box above the form
  lists what the rules already caught; weigh those in your verdict, but do not
  re-list them as issues. Add a `definition` issue only when a definition
  *exists but is poor*, not when it is *absent* (the rule owns absence).
- **Two labelers + adjudication where possible.** A golden standard set by one
  person bakes in that person's idiosyncrasies. If two of you label
  independently (on separate branches) and reconcile disagreements in review,
  the standard is far stronger.

## Returning your work

Commit `test/fixtures/golden/labels.json` on a branch, push, and notify the
integrating engineer. They run:

```
npm run label:import -- --labeled-by <your-handle>
```

which validates every label and merges them (with `labeledBy`/`labeledAt`
provenance) into the golden manifests via a reviewed commit. A bad value is
rejected at validation time with a clear message naming the case.

## What this feeds

Once labeled, the threshold metrics (LLM precision/recall, rank correlation ρ)
can be calibrated against your labels (design-doc step 5), which in turn gate
the Phase 2 LLM scoring layer (step 6). Until then, those metrics are
report-only; the deterministic hard gates already run.
