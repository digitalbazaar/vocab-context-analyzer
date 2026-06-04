# Phase 1 Implementation Plan — Functional Core First
**Status:** Draft for review **Date:** 2026-06-03 **Scope:** SPEC §5.1 deterministic checks + §6.1 Finding model. Pure core only.

* * *
## Goal
Build the pure functional core: a `runRules(model) -> Finding[]` function over an already-resolved, in-memory vocab+context model. No IO, no network, no CLI, no LLM. This is the smallest trustworthy slice and the foundation the golden-set eval (§7) tests against.

Acceptance for the slice: every rule below is red/green TDD'd, and the `Finding[]` output passes schema validation.
## Out of scope (this slice)
- IO shell (file loading, IRI resolution/fetch, `jsonld-document-loader` reuse).
  
- CLI and GitHub Action distribution.
  
- Resolvability check (needs network → belongs in the shell, stubbed in core).
  
- The full ~50-example golden set (built incrementally; this slice seeds a few).
  
- Anything LLM (phase 2).
  
## Stack (decided)
- Plain JavaScript, ESM, Node (CI matrix 22/24/26; lint fixed 22).
  
- Mocha + chai. Tests in `test/mocha/NN-kebab.js`.
  
- `@digitalbazaar/eslint-config` (node-recommended).
  
- Copyright header `Copyright (c) 2026 Digital Bazaar, Inc.` on every source file.
  
## Layout
```
lib/
  finding.js            # Finding factory + severity/source/artifact enums
  findingSchema.js      # JSON schema for Finding[] (the §7 programmatic check)
  model.js              # shape of the resolved vocab+context model the core takes
  rules/
    index.js            # rule registry (array of {id, run})
    contextIriResolves.js   # ctx/iri-unresolved: every term -> absolute IRI
    iriCollision.js         # ctx/iri-collision: no two terms -> same IRI unintended
    coverage.js             # pair/coverage: vocab terms present in context (WARNING)
    orphanMapping.js        # pair/orphan: context key with no vocab term (ERROR)
    termHasDefinition.js    # vocab/no-definition: rdfs:label|comment present
  runRules.js           # model -> Finding[]; runs registry, sorts, validates
index.js                # public entry: export {runRules, ...}
test/mocha/
  01-finding.js
  02-context-iri-resolves.js
  03-iri-collision.js
  04-coverage.js
  05-orphan-mapping.js
  06-term-has-definition.js
  07-run-rules.js       # integration: model -> Finding[] + schema validity
```
## Finding model (from SPEC §6.1)
```
Finding {
  id            // stable rule id, e.g. "ctx/iri-collision"
  severity      // "error" | "warning" | "info"
  source        // "deterministic" (phase 1) | "llm" (phase 2)
  artifact      // "vocabulary" | "context" | "pairing"
  term?         // the specific term/IRI implicated
  message       // human-readable
  remediation?  // optional suggested fix
}
```

`finding.js` exports a `createFinding()` factory + frozen enum objects. `findingSchema.js` exports a schema; `runRules` validates its own output and throws on violation (fail-loud — a malformed finding is a bug, not a finding).
## The resolved model the core takes (model.js)
The core does NOT parse Turtle/JSON-LD or fetch IRIs — the shell does that later and hands the core a plain object. Documented shape (informal, this slice):

```
{
  vocab: {
    terms: [{ id, iri, type, label?, comment?, domain?, range?, deprecated? }]
  },
  context: {
    mappings: [{ term, iri }],   // resolved: each context key -> absolute IRI
    raw?: {}                      // original @context object, for processing checks
  }
}
```

Resolution (prefix expansion, fetching) is the shell's job. The core assumes IRIs are already absolute where resolvable, and `null`/missing where not — so `contextIriResolves` checks for missing/relative, not network reachability.
## Rules in this slice (subset of SPEC §5.1)
| id  | artifact | severity | checks |
| --- | --- | --- | --- |
| `ctx/iri-unresolved` | context | error | every context mapping has an absolute IRI |
| `ctx/iri-collision` | context | error | no two distinct terms map to the same IRI |
| `vocab/no-definition` | vocabulary | warning | every vocab term has label or comment |
| `pair/coverage` | pairing | **warning** | every vocab term appears in the context (per resolved §11.1.3) |
| `pair/orphan` | pairing | error | no context mapping references a non-existent vocab term |

Deferred to later slices: `@type` coercion, `@protected`, `@vocab` canonicalization, subclass/subproperty integrity, IRI-stability heuristics, deprecation handling, version agreement, resolvability (shell).
## Red/Green TDD order
1. `01-finding.js` — RED: assert `createFinding` shape + schema rejects a bad finding. GREEN: implement factory + schema.
  
2. `02..06` — one rule at a time. Each: RED with a fixture model that should produce a known finding (and a clean model that should not) → GREEN minimal rule.
  
3. `07-run-rules.js` — RED: registry runs all rules over a model, returns a sorted `Finding[]`, and the array validates against the schema. GREEN: wire `runRules`.
  

Each rule's test is a tiny inline model object — the declarative oracle in miniature, before the yml2vocab fixture factory exists.
## Eval hook (SPEC §7)
This slice establishes the substrate for the recall=1.0 gate: the per-rule "clean model produces no finding / defective model produces exactly the seeded finding" tests ARE the seeded-defect recall check at unit scale. The yml2vocab fixture factory (later slice) scales the same idea to full artifacts.
## Tooling / CI (this slice or immediately after)
- `package.json` — type: module, scripts: `test` (mocha), `lint` (eslint).
  
- `.editorconfig` (yml2vocab honors it too — handy for future fixture gen).
  
- `eslint.config.js` — `@digitalbazaar/eslint-config/node-recommended`.
  
- `.github/workflows/` — lint job (Node 22, no matrix) + test job (22/24/26), siblings, `permissions: {}`, `actions/checkout@v6`, `setup-node@v6`.
  
## Open questions
1. {==**Model shape ownership** — should `model.js` be a formal JSON schema too, or stay an informal JSDoc-documented shape until the shell defines it for real?==}{>>inclined to leave it informal but open to arguments<<}{id="c1" by="user" at="2026-06-03T22:07:05.078Z"}
  
2. {==**Rule registry vs. explicit list** — registry array now, or wait until there are enough rules to justify the indirection? (Leaning: explicit list now, registry when it earns its keep.)==}{>>list for now<<}{id="c2" by="user" at="2026-06-03T22:07:28.313Z"}
  
3. {==**Branch name** — `feature/phase1-core`? Or split tooling (package.json, CI) onto its own setup branch first, then the core onto a feature branch?==}{>>stay with phase1-core<<}{id="c3" by="user" at="2026-06-03T22:07:37.375Z"}
