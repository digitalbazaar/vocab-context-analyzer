# Phase 2 Eval Gate — Design
**Status:** Reviewed; open questions resolved. No code yet. **Branch:** `feature/phase2-eval-gate` **Author:** DJ Scruggs (drafted with Claude) **Date:** 2026-06-29

This concretizes SPEC §7 into something buildable. Phase 2 puts an LLM in the runtime path (design-quality scoring, model-to-English rendering), and DB's rule is **no eval gate = no LLM feature**. This gate is built and green _before_ any LLM call lands. It is the merge gate for all Phase 2/3 work.

The gate has the four required pieces: a measurable outcome, a labeled golden set, programmatic checks, and regression detection. Each is specified below with concrete file layout, schema, and thresholds.

* * *
## 1. Measurable outcome
What the LLM layer optimizes for, restated as numbers we can track:

| Metric | Definition | Gate |
| --- | --- | --- |
| **Deterministic recall** | seeded defects flagged ÷ seeded defects | `== 1.0` (hard) |
| **LLM finding precision** | true LLM findings ÷ all LLM findings, vs. labels | `≥ T_p` (TBD) |
| **LLM finding recall** | labeled subjective issues found ÷ all labeled | `≥ T_r` (TBD) |
| **Rank correlation** | Spearman ρ of LLM design score vs. expert ranking | `≥ T_ρ` (TBD) |
| **Deferral rate** | non-actionable LLM findings ÷ all LLM findings | `== 0` (hard) |
| **Citation validity** | LLM findings referencing a real term ÷ all | `== 1.0` (hard) |
| **English faithfulness** | renderings matching the expanded model ÷ all | `== 1.0` (hard) |

The three "hard" `==` gates are deterministic and need no human labels beyond the golden set — they are the _floor_ and ship first. The threshold-based metrics (`T_*`) need the expert-labeled set and a calibration run to set defensible numbers; see Open Questions.

* * *
## 2. Golden dataset
### 2.1 What exists today
`test/fixtures/golden/generated/manifest.json` has **6 cases** (1 good, 5 broken), each labeled with `expectedRuleIds` — the _deterministic_ oracle. This already powers the Phase 1 recall=1.0 gate. It is the seed, not the whole set.
### 2.2 What Phase 2 adds
SPEC §7 calls for **~50 labeled examples** drawn from DB's own vocabs/contexts plus broken variants. The eval needs labels the current manifest does not carry. Proposed extension to each manifest entry (additive — Phase 1 still reads `expectedRuleIds` unchanged):

```jsonc
{
  "name": "good",
  "vocab": "good.jsonld",
  "context": "good.context.jsonld",
  "expectedRuleIds": [],            // existing — deterministic oracle

  // --- new Phase 2 labels ---
  "overall": "good",                // "good" | "bad" | "borderline"
  "designRank": 3,                  // expert ordinal within its cohort, for ρ
  "subjectiveIssues": [             // term-level LLM-checkable issues
    { "term": "https://example.org/v#knows",
      "category": "naming",         // naming | definition | modeling | coverage
      "note": "verb-phrase predicate, inconsistent with noun siblings" }
  ],
  "labeledBy": "expert-id",         // provenance of the human label
  "labeledAt": "2026-06-29"
}
```
### 2.3 Composition of the ~50
| Source | ~Count | Role |
| --- | --- | --- |
| Published DB/W3C contexts (the 9 real fixtures already present) | 9   | known-good anchors (`overall: good`) |
| `yml2vocab`-generated good variants | ~15 | clean generator output |
| Seeded-defect variants (extend the existing 5) | ~20 | broken oracle, deterministic + subjective |
| Borderline / debatable cases | ~6  | calibrate the score and the `borderline` band |

`yml2vocab` stays the canonical generator-under-test (SPEC §9.1). Good variants are generated; defects are applied via the documented JSON mutations already in `scripts/build-fixtures.js`.

* * *
## 3. Programmatic checks
These run with no human in the loop on every change to rules **or** prompts.

1. **Schema validation** — every `Finding[]` (deterministic + LLM) validates against `findingSchema.js`. Reuses the existing validator.
  
2. **Deterministic exact-match** — recall must be `1.0` on every seeded defect. This is the existing Phase 1 gate, unchanged.
  
3. **Citation validity** — every LLM finding's `term` must resolve to a real term in the model. Checkable against the loaded model — no LLM needed to judge. A hallucinated term fails the run.
  
4. **Deferral rate** — every LLM finding must carry an actionable `remediation`; uncertainty goes in a `confidence` field, never refusal. Deferrals (a closed list of non-actionable phrasings + a `defer` flag) count as failures. Target `0`.
  
5. **English faithfulness** — the rendering has a deterministic spine (subject/property/range from the expanded model), so the rendered triple must match the model. Checkable without an LLM judge.
  

Checks 1–5 are **deterministic** — they need the golden set but no expert labels and no second model as judge. They are the part of the gate we can build and turn green immediately, ahead of any scoring/threshold calibration.

* * *
## 4. Regression detection
- CI runs the full golden set on every change to `lib/rules/`, the prompt files, or the model pin.
  
- A new CI job `eval` (sibling to `lint`/`test`, no `needs:`) runs the gate. Hard-gate failures (recall, deferral, citation, faithfulness, schema) fail the build. Threshold metrics are compared against committed baselines; a drop past tolerance fails the build.
  
- **Model + prompt are pinned** and recorded in every report (`model`, `promptVersion`) for reproducibility. The pinned model is **`claude-opus-4-8`** (DB standard: latest Claude). Changing either is a deliberate PR that re-runs the gate.
  
- The LLM-dependent metrics (precision/recall/ρ) require live model calls. **Decided:** the default CI `eval` job runs only the _deterministic_ checks against a **recorded-response fixture** (cached model outputs) so CI stays deterministic, cheap, and needs no provisioned key; the live-model calibration run is a separate, **manually-triggered** workflow.
  

* * *
## 5. Build order (when approved)
1. **Extend the manifest schema** with the Phase 2 label fields (additive; Phase 1 untouched). Add a JSON-schema validator for the manifest itself.
  
2. **Build the deterministic checks** (§3.1–3.5) over the existing 6 cases — no LLM, no expert labels. Turn them green. _This is a shippable gate floor._
  
3. **Grow the golden set** toward ~50 with `yml2vocab` good variants and more seeded defects.
  
4. **Add expert labels** (`overall`, `designRank`, `subjectiveIssues`) — a **senior DB engineer (not DJ)** owns the rankings; this step is blocked on their pass.
  
5. **Calibrate thresholds** (`T_p`, `T_r`, `T_ρ`) from a baseline live run; commit them as the regression baseline.
  
6. _Only then_ does Phase 2 LLM scoring code begin, gated by this harness.
  

Steps 1–2 are pure functional-core work (data + deterministic checks) and need no external input. Steps 3–5 have dependencies recorded below.

* * *
## 6. Resolved decisions (from review, 2026-06-29)
- **Expert labels:** a **senior DB engineer (not DJ)** owns the `designRank` and `subjectiveIssues` rankings. Step 4 is blocked on their pass; DJ does not self-label the golden set.
- **CI vs. live model:** the default CI `eval` job runs **deterministic checks against recorded model responses** (no live calls, no provisioned key in CI). The live-model calibration run is a **separate, manually-triggered workflow**.
- **Model pin:** **`claude-opus-4-8`** (DB standard: latest Claude). A `promptVersion` string is recorded alongside it in every report. The recording *mechanism* is built in step 1; the calibrated threshold *values* land in step 5.
- **Thresholds (`T_p`, `T_r`, `T_ρ`):** built **report-only (non-blocking)** until a baseline calibration run sets defensible values, then flipped to blocking. The hard `== ` gates (recall, deferral, citation, faithfulness, schema) are blocking from day one.

* * *
## 7. What this draft does NOT decide
- The Phase 2 LLM prompt design and scoring rollup formula (that's the Phase 2 feature spec, separate doc).
  
- Model-to-English rendering wording (Phase 2 feature).
  
- Anything in Phase 3 (interactive reviewer).
  

This document is scoped to the **eval gate** — the measurement harness that must exist before any of the above can merge.
