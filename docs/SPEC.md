# Technical Spec — Vocabulary & Context Quality Analyzer

**Status:** Draft for review
**Author:** DJ Scruggs
**Date:** 2026-06-03
**Reviewers:** Engineering, DevOps, CTO, Privacy Officer

---

## 1. Summary

A tool that evaluates whether a JSON-LD/RDF **vocabulary** and its companion
**`@context`** document are well designed, and reports where they should be
improved. It must also run against the output of third-party tools that
auto-generate vocabularies and contexts, so we can judge those generators.

Delivered in three phases:

1. **Deterministic CI core** — rule-based validator, pass/fail + structured report.
2. **LLM scoring layer** — design-quality score + prose, for comparing artifacts and generators.
3. **Interactive reviewer** — conversational, human-in-the-loop authoring aid.

The phasing is deliberate: phase 1 has objective ground truth and needs no eval
infrastructure to trust; phases 2–3 put an LLM in the judgment path and are
gated on the eval strategy in §7.

---

## 2. Motivation

DB authors and consumes many JSON-LD vocabularies and contexts (security,
credentials, citizenship, etc.). Two recurring risks:

- **Hand-authored drift** — contexts and the vocabularies they map to fall out
  of sync; terms get added to one and not the other.
- **Auto-generated quality** — tools that generate vocabs/contexts produce
  output of unknown quality. We have no systematic way to grade them.

Bad contexts fail in ways that are hard to debug downstream (silent term
dropping, IRI collisions, non-canonical signatures). Catching them at author /
generate time is far cheaper than at verification time.

**Conceptual neighbor:** `jsonld-document-loader` resolves contexts at runtime.
This tool is the *design-time* counterpart — it judges the artifacts that loader
will later fetch and apply. Reusing its resolution/caching logic is a candidate
(see §9).

---

## 3. Scope

### 3.1 In scope

- **Vocabulary artifacts:** RDFS / OWL / SKOS term definitions
  (Turtle, N-Triples, RDF/XML, JSON-LD serializations).
- **`@context` artifacts:** JSON-LD context documents (standalone or embedded).
- **The pairing between them** — does the context faithfully and completely map
  the vocabulary's terms?
- **Running against external generators' output** as a first-class use case.

### 3.2 Out of scope (initially)

- Validating *instance data* (actual credentials) against the vocab — that is
  SHACL/schema validation, a separate concern.
- Authoring/editing the vocab or context (phase 3 *suggests*; it does not
  auto-commit changes).
- Non-JSON-LD vocabularies (XML Schema, plain JSON Schema) — explicitly deferred.

### 3.3 Two artifacts, two failure modes

These are different problems and the tool treats them separately:

| Artifact | Layer | "Well designed" means |
|---|---|---|
| Vocabulary (RDFS/OWL/SKOS) | Semantic | Terms have definitions, sane domain/range, coherent hierarchy, deprecation handled, stable IRIs |
| `@context` | Syntactic mapping | Every key maps to a resolvable IRI, no collisions, explicit `@type` coercion, `@protected` where needed, deterministic processing |
| The pair | Coherence | Context covers the vocab; no orphan mappings; versions agree |

---

## 4. Users & Use Cases

1. **Vocab/context author (DB engineer)** — runs the tool locally before
   committing a new or changed context. Wants actionable findings.
2. **CI pipeline** — runs the deterministic core on every PR touching a
   vocab/context; fails the build on errors.
3. **Generator evaluator** — points the tool at the output of an auto-generation
   tool to grade it and compare generators against each other.

---

## 5. The Judgment Split — Deterministic vs. LLM

This was flagged as a decision to make *within* the spec. Recommendation:

**Default to deterministic. Reserve the LLM for the genuinely subjective.**

Rationale: most of what makes a context "broken" is objective and checkable
without a model. An LLM in the path adds cost, nondeterminism, and an eval
burden (§7). Spend that budget only where rules genuinely cannot reach.

### 5.1 Deterministic checks (phase 1 — no LLM)

Structural / verifiable facts. Each emits a finding with a severity.

**Context checks**
- Every term resolves to an absolute IRI (no dangling prefixes).
- No two terms map to the same IRI without intent (collision detection).
- `@type` coercions present where the vocab declares a datatype/object property.
- `@protected` usage consistent with DB conventions.
- No use of relative IRIs as `@vocab` where it breaks canonicalization.
- Context is itself valid JSON-LD and processes without error/warning.
- Deterministic processing: same input → same expanded output (canonicalization smoke test).

**Vocabulary checks**
- Every term has an `rdfs:label` / `rdfs:comment` (or SKOS equivalent).
- `rdfs:domain` / `rdfs:range` present and resolvable for properties.
- No broken subclass/subproperty references.
- Deprecated terms marked with `owl:deprecated` rather than deleted.
- IRI stability heuristics (no version numbers embedded in term IRIs, etc.).

**Pairing checks**
- Every vocab term appears in the context (coverage %).
- No context mapping points to a vocab term that does not exist (orphans).
- Version metadata, if present, agrees between the two.

**Resolvability**
- All external IRIs resolve (with caching; offline mode falls back to a snapshot).

### 5.2 LLM checks (phase 2 — subjective only)

Things rules cannot judge:
- **Naming quality** — are term names clear, consistent, idiomatic, non-redundant?
- **Definition quality** — is each `rdfs:comment` actually informative, or boilerplate?
- **Modeling judgment** — is this property really sub-classing the right thing?
  Should these two terms be one? Is the granularity right?
- **Consistency of style** across the vocabulary as a whole.

LLM output is **advisory and scored**, never a hard CI failure on its own. Every
LLM finding must cite the specific term(s) it refers to so it is checkable.

### 5.3 Why not LLM-first

An LLM-centric design would be faster to prototype but: (a) can't be trusted in
CI without the full eval harness already built, (b) makes regressions invisible
when the model or prompt changes, (c) costs per-run on artifacts that are mostly
checkable for free. Deterministic-first lets phase 1 ship and deliver value
before we owe anyone an eval.

---

## 6. Architecture (functional core, imperative shell)

```
                 ┌────────────────────────────────────────┐
  vocab + context│              IMPERATIVE SHELL            │
  ──────────────▶│  IRI resolution / fetch / cache (IO)     │
                 │  file loading, report output, LLM calls  │
                 └───────────────────┬──────────────────────┘
                                     │ resolved, in-memory model
                                     ▼
                 ┌────────────────────────────────────────┐
                 │              FUNCTIONAL CORE             │
                 │  pure rule checks → findings[]           │
                 │  scoring aggregation (deterministic)     │
                 │  pairing/coverage analysis               │
                 └────────────────────────────────────────┘
```

- **Core is pure:** takes an already-resolved vocab+context model, returns
  `Finding[]`. No network, no disk. Trivially unit-testable — this is where the
  golden set (§7) drives tests.
- **Shell does IO:** fetching/resolving IRIs (candidate reuse of
  `jsonld-document-loader`), reading files, writing reports, and — phase 2 —
  calling the LLM. The LLM call lives at the boundary so the core stays
  deterministic and testable.

### 6.1 Finding model

```
Finding {
  id            // stable rule id, e.g. "ctx/iri-collision"
  severity      // error | warning | info
  source        // "deterministic" | "llm"
  artifact      // "vocabulary" | "context" | "pairing"
  term?         // the specific term/IRI implicated
  message       // human-readable
  remediation?  // suggested fix (phase 3 fills this in richly)
}
```

### 6.2 Output modes (the three phases)

- **Phase 1 — CI linter:** exit non-zero on any `error`. Emits JSON + a
  human-readable summary. SARIF output is a candidate for GitHub annotations.
- **Phase 2 — Scored report:** deterministic findings + LLM-judged design score
  (per category: naming, definitions, modeling, coverage). Enables
  generator-vs-generator comparison. Score is a transparent weighted rollup, not
  a black box.
- **Phase 3 — Interactive reviewer:** conversational, explains findings and
  proposes concrete edits; human accepts/rejects. No auto-commit.

---

## 7. Eval Strategy (REQUIRED — LLM in runtime path)

Per DB's AI eval gate: phases 2–3 must not ship without this. Phase 1 is
deterministic and self-validating, but its **golden set doubles as the eval
foundation** for later phases, so we build it in phase 1.

1. **Measurable outcome the tool optimizes for:**
   agreement with expert human judgment on whether an artifact is well designed
   — measured as precision/recall of findings against a labeled set, and rank
   correlation of LLM design scores vs. expert ranking.

2. **Golden dataset (build during phase 1):**
   ~50 labeled examples drawn from **DB's own vocabs/contexts** (the agreed
   first targets) plus deliberately-broken variants. Each labeled with: known
   issues (term-level), an overall good/bad/borderline label, and an expert
   design ranking for the scoring eval. DB's published contexts are the
   known-good anchors.

3. **Programmatic checks (≥1, we have several):**
   - Schema validation of the `Finding[]` output.
   - Exact-match: deterministic rules must flag every seeded defect in the
     broken variants (recall = 1.0 on the deterministic set is a release gate).
   - For LLM findings: every finding must reference a real term (citation
     validity check) — hallucinated terms fail the run.

4. **Regression detection before users:**
   - CI runs the full golden set on every change to rules *or* prompts.
   - Track deterministic recall (must stay 1.0) and LLM precision / rank
     correlation against a threshold; a drop blocks merge.
   - Prompt and model version are pinned and recorded in each report for
     reproducibility.

---

## 8. Data Flows & Privacy

- **Inputs:** vocabulary files, context files, and the external IRIs they
  reference. All are **public schema/ontology documents** — not personal data.
- **LLM calls (phase 2+):** send vocab/context text (public artifacts) to the
  model. **No personal/instance data is ever sent** — the tool refuses to run on
  credential instances (out of scope, §3.2).
- **Privacy impact:** none expected — no personal information categories are
  collected, processed, or transmitted. To be confirmed by Privacy Officer.
- **Caching:** resolved external contexts cached locally (same concern as
  `jsonld-document-loader`); cache holds only public documents.

---

## 9. Reuse & Dependencies

- **`jsonld-document-loader`** — strong candidate for the IRI resolution/caching
  in the shell. Avoids reimplementing context fetching and gives us the same
  resolution semantics as runtime.
- **`jsonld.js`** — for expansion/compaction and the canonicalization smoke test.
- **An RDF parser** (e.g. N3.js/rdf-ext) for the Turtle/N-Triples vocab side.
- **`@digitalbazaar/eslint-config`**, DB CI conventions, copyright headers — per
  engineering standards.

---

## 10. Phasing & Milestones

| Phase | Deliverable | Eval owed |
|---|---|---|
| 1 | Deterministic CI linter + Finding model + golden set built | Schema + recall=1.0 on seeded defects |
| 2 | LLM scoring layer + report + generator comparison | Precision threshold + rank correlation + citation validity |
| 3 | Interactive reviewer with remediation suggestions | Human acceptance rate of suggestions tracked |

Phase 1 ships standalone value (catches real breakage in CI) before any LLM
commitment.

---

## 11. Open Questions (Deferred)

These are deferred until after the repo and base spec are in place. They do not
block phase 1; they shape phases 2–3 and are revisited before that work starts.

1. **Which DB vocabs/contexts** form the v1 golden set, and who labels them?
   (Need an expert to define "well designed" concretely enough to label.)
2. **Generators to target** — which auto-generation tools specifically does the
   CTO want graded? That shapes the comparison report in phase 2.
3. **Is `jsonld-document-loader` reuse viable**, or does design-time resolution
   need different behavior (e.g. always-fresh, stricter errors) than runtime?
4. **Severity policy** — which deterministic checks are hard CI failures vs.
   warnings? (e.g. is incomplete coverage an error or a warning?)
5. **What does "well designed" mean to DB precisely** — is there an existing
   internal style guide for vocab/context authoring to encode as rules, or do we
   derive it from the known-good corpus?
6. **Score interpretation** — what does a phase-2 score *mean* to a consumer, and
   what threshold (if any) gates accepting a generator's output?
7. **Distribution** — standalone CLI/library, a GitHub Action, or both?

---

## 12. Risks

- **Subjectivity of "well designed"** — the central risk. Mitigated by
  deterministic-first design and a labeled golden set; without expert labels the
  LLM phases have no ground truth.
- **LLM nondeterminism / drift** — mitigated by pinned prompt+model, citation
  checks, and CI eval gates.
- **Over-flagging** — a noisy linter gets ignored. Severity discipline and
  precision tracking matter.
- **Resolution flakiness** — external IRIs that don't resolve; mitigated by
  caching + offline snapshot mode.
