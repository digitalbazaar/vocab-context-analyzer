# Plan — Operational Eval Runner + CI Gate
**Status:** Draft for review. **Date:** 2026-06-30. **Relates to:**`docs/PHASE2-EVAL-GATE.md` §3–4, SPEC §7. **Depends on:** merged PR #1 (`lib/eval/manifestSchema.js`, `lib/eval/checks.js`).
## Goal
Make the eval gate **runnable**. Today the gate's pieces exist as pure functions but nothing executes them together, and the recall=1.0 logic is trapped inside `test/mocha/13-golden-set.js`. Build a runner that turns the golden set + a finding-producing function into a metrics report, expose it via CLI, and add a CI `eval` job. No LLM code — this is the harness that must exist before Phase 2 LLM work (CLAUDE.md: no eval gate = no LLM feature).
## Scope (this PR)
Deterministic metrics only. LLM-dependent metrics (precision/recall/ρ) are deferred to a later, manually-triggered calibration run (design doc §4).
## Functional core — `lib/eval/runEval.js`
Pure. Takes the loaded cases + findings, returns a structured report. No IO.

```
evaluate({cases, findingsByCase}) -> {
  recall: {seeded, caught, rate},        // deterministic recall (== 1.0 gate)
  citation: {valid, hallucinated},       // reuse checks.citationValidity
  deferral: {rate, deferred},            // reuse checks.deferralRate
  faithfulness: {faithful, unfaithful},  // reuse checks.englishFaithfulness
  hardGatePassed: boolean                // all == gates satisfied
}
```

- `cases`: manifest entries + their loaded model + expected rule ids.
  
- `findingsByCase`: map case name -> Finding[] (deterministic now; LLM later).
  
- Recall logic is LIFTED from `13-golden-set.js` (which then calls this, so the test asserts the extracted function rather than duplicating it).
  
## Imperative shell — `scripts/eval.mjs`
Reads the manifest, loads each case's vocab/context (`loadModel`), runs `runRules`, calls `evaluate`, prints a report, exits non-zero if a hard gate fails. This is what CI invokes.
## CI — `.github/workflows/main.yml`
Add an `eval` job, sibling to `lint`/`test` (no `needs:`), Node 22.x, `permissions: {}`. Runs `node scripts/eval.mjs`. Deterministic — no model key.
## Tests (TDD)
- `test/mocha/24-run-eval.js` — unit tests for `evaluate`: recall math (all caught, some missed), hard-gate pass/fail, reuse of the three checks with synthetic LLM findings.
  
- Refactor `13-golden-set.js` to call `evaluate` (no behavior change; stays green). This proves the extraction is faithful.
  
## Build order
1. RED: `24-run-eval.js` against a not-yet-existing `evaluate`.
  
2. GREEN: implement `lib/eval/runEval.js`.
  
3. Refactor `13-golden-set.js` to consume it; keep green.
  
4. Add `scripts/eval.mjs`; run it locally against the 6-case set.
  
5. Add the CI `eval` job.
  
## Resolved decisions (review 2026-07-01)
1. **Report shape** — the JSON shape above is sufficient; no separate
   human-readable summary line.
2. **Hard-gate scope now** — compute AND report all three checks (citation,
   deferral, faithfulness) from day one, so the gate is fully wired and ready.
   With no LLM findings yet they trivially pass (empty LLM set); intended, not a
   stub.
3. **`scripts/` convention** — match `scripts/build-fixtures.js`: use
   **`scripts/eval.js`** (plain `.js`).

## Known limitations / follow-ups (deferred from PR #10)

The known-good real-context anchors (PR #10) shipped with three accepted
trade-offs, surfaced in review. None block the gate; each is a future PR.

1. **Anchors are a parallel manifest + loader, outside the schema.**
   `test/fixtures/golden/anchors.json` + `scripts/loadAnchors.js` duplicate the
   golden-set case shape but sit outside `lib/eval/manifestSchema.js`
   (`validateManifestEntry` requires `vocab`, so it rejects a context-only
   anchor). The two manifests can drift. **Right-altitude fix:** one manifest
   with `vocab` optional (defaulting to `{}`) and `manifestSchema` relaxed to
   allow context-only entries, so a single loader + schema covers both golden
   cases and anchors. This also unblocks a future third category (real contexts
   paired with a real vocabulary as seeded-defect cases), which today fits
   neither the generated dir nor the context-only anchors file.

2. **The manifest→case build loop is duplicated three ways.**
   `scripts/loadAnchors.js`, `scripts/eval.js`, and `test/mocha/13-golden-set.js`
   each build `{name, model, expectedRuleIds ?? []}` from a manifest entry.
   Extract a shared `loadCasesFromManifest(dir, entries, {vocabOptional})`
   helper (plus a path-taking `readJson`) so case shape changes land in one
   place. Folds naturally into follow-up 1.

3. **`scripts/loadAnchors.js` breaks the `scripts/` kebab-case convention.**
   Resolved decision 3 above pins `scripts/` files to kebab-case
   (`build-fixtures.js`, `eval.js`); `loadAnchors.js` is camelCase. Rename to
   `scripts/load-anchors.js` (it merges away entirely under follow-up 1).

## Regression-anchor triage (2026-07-02)

The three real contexts that produce findings (deferred from PR #10) were
triaged against their actual term nodes. **Verdict: every finding is real
signal, not over-flagging** — no analyzer bug (unlike the `ctx/iri-collision`
`@container` case). They are pinned as **exact-match regression anchors** (a new
`exact: true` anchor kind) so a rule that later over- or under-flags one of
these real artifacts fails the gate:

- **did** (vocab + context): `vocab/no-definition` (`did:service`,
  `did:serviceEndpoint` genuinely lack `rdfs:label`/`rdfs:comment`),
  `vocab/missing-domain-range` (9 properties genuinely lack `rdfs:domain`),
  `pair/coverage` (real vocab terms not mapped in the context). Its findings are
  vocab-side, so this anchor loads the real vocabulary (the first anchor to do
  so — anchors are otherwise context-only).
- **odrl**: `ctx/unprotected` (the context is genuinely not `@protected`).
- **activitystreams**: `ctx/unsafe-vocab` (`@vocab` is the blank-node `_:`) and
  `ctx/unprotected`.

If any of these findings should instead be *suppressed* (i.e. judged a rule
being too aggressive on a legitimate pattern), that is a rule change + fixture
re-triage, not an anchor edit.
