# Golden-Set Labeling Guide

**Audience:** the engineer labeling the Phase 2 eval golden set (design doc
`PHASE2-EVAL-GATE.md` §2.2, build-order step 4). **Status:** ready to use.

The Phase 2 LLM layer will be measured against a human-labeled standard. This
guide is how that standard is produced: for each golden-set case you assign an
overall verdict, a rank within its cohort, and any term-level subjective issues.
The deterministic rules already catch objective defects — **your job is the
layer they cannot reach** (naming, definitions, modeling, coverage judgment).

## What you get

Run `npm run label:packets` to generate one packet per case under
`test/fixtures/golden/packets/<name>.json` (git-ignored; regenerate any time).
Each packet has:

- `terms` — every term rendered flat: `iri`, `kind`, `label`, `comment`,
  `domain`, `range`, `subClassOf`, `deprecated`. A `null` means the field is
  absent (e.g. `comment: null` → nothing to judge the definition on).
- `deterministicFindings` — what the rules already flagged. **Do not re-report
  these.** They frame what is already known-broken; you add the subjective layer.
- `labels` — the stub you fill in: `overall`, `designRank`, `subjectiveIssues`.

## What you fill in

### `overall` — one of `good` | `bad` | `borderline`

Your holistic verdict on whether this vocabulary/context is well designed.
`borderline` is a real answer for genuinely debatable cases — it is **not** a
way to avoid deciding (see No-Deferral below).

### `designRank` — an ordinal within the case's cohort

A non-negative integer ranking this case against the others **in its cohort**
(best design = highest, or pick one direction and be consistent). Ranking only
makes sense within a comparable group — you will be told which cases form a
cohort (e.g. "these credential contexts"). Do not rank across unrelated vocabs;
that produces a meaningless ordering. This drives a rank-correlation metric, so
consistency within the cohort matters more than absolute numbers.

### `subjectiveIssues[]` — term-level problems the rules cannot catch

Each issue: `{ "term": "<full IRI>", "category": "<one of below>", "note":
"<actionable observation>" }`. Use the term IRIs exactly as they appear in the
packet's `terms[].iri`.

| `category` | What it covers | Example note |
| --- | --- | --- |
| `naming` | Clarity, consistency, idiom of a term name | "verb-phrase predicate, inconsistent with noun siblings" |
| `definition` | Is the `rdfs:comment` informative, or boilerplate/circular/absent? | "comment restates the label, says nothing about semantics" |
| `modeling` | Granularity, subclassing, Thing-vs-bag-of-JSON | "a printable flag on Person models a document concern as a person attribute" |
| `coverage` | Conceptual gaps — an obvious attribute the vocab gives no way to express | "no property for a Person's birth date, though the domain needs it" |

## Rules (non-negotiable)

- **No deferrals.** (SPEC §5.2.1.) A note like "needs expert input", "it
  depends", or a bare "consider X" with no rationale is a **failed label**, not
  a cautious one — this set is the standard the model is judged against, so it
  must commit. If you genuinely cannot decide the overall verdict, that is
  `overall: borderline` with a note explaining the tension — not an empty label.
- **Every `note` must be actionable.** State what is wrong and, where possible,
  what would fix it. "Bad name" is not enough; "rename to a noun to match its
  siblings" is.
- **Stay in your lane — subjective only.** If something is a `pair/coverage` or
  `vocab/no-definition` defect the rules already listed, it is not a subjective
  issue. Add a `definition` issue only when a comment *exists but is poor*, not
  when it is *absent* (the rule owns absence).
- **Two labelers + adjudication where possible.** A golden standard set by one
  person bakes in that person's idiosyncrasies. If two of you label
  independently and reconcile disagreements, the standard is far stronger.

## Returning your work

Fill the `labels` block in each packet (or a copy), and set provenance:
`labeledBy` (your id) and `labeledAt` (ISO date). The filled label fields map
1:1 to the manifest schema (`lib/eval/manifestSchema.js`), so they can be
merged back into the case's manifest entry directly. The engineer integrating
them will validate each against `validateManifestEntry` before committing.

## What this feeds

Once labeled, the threshold metrics (LLM precision/recall, rank correlation ρ)
can be calibrated against your labels (design-doc step 5), which in turn gate
the Phase 2 LLM scoring layer (step 6). Until then, those metrics are
report-only; the deterministic hard gates already run.
