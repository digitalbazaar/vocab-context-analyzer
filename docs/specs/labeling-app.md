# Labeling App (local server + browser UI)

**Status:** Reviewed 2026-07-04; open questions deferred (proceed on the
defaults stated inline). **Revised 2026-07-06:** the spreadsheet/CSV labeling
kit is removed entirely (it never merged and the app supersedes it); labels
persist as a validated `labels.json`. **Date:** 2026-07-04.

## Summary

A local labeling tool for the Phase 2 golden set (design doc
`PHASE2-EVAL-GATE.md` §2.2 step 4). `npm run label:app` starts a Node server
bound to localhost, serving a single-page UI: the case's raw JSON-LD documents
(with a flattened term-summary toggle) on the left, and the labeling form
(`overall` toggle buttons, drag-to-rank within cohort, add-a-row subjective
issues with term and category pickers) on the right, with rule-caught findings
shown above the form when present. Every save writes a validated
`test/fixtures/golden/labels.json` into the working tree; a separate import
script merges the labels into the committed manifests. Makes invalid values
unenterable rather than caught-at-parse.

## Implementation details & assumptions

- **Functional core / imperative shell**, matching the repo pattern:
  - `lib/eval/manifestSchema.js` gains `validateLabel(label, name)` — the
    single validator for the `labels.json` payload shape (`null` marks an
    unset field), shared by the server (save-time) and importer (import-time).
  - New `lib/eval/labelAppCore.js` (pure): `buildKit` (the API payload),
    `checkRequest` (Host/Origin/route security decision), and the blinding
    layer (`makeBlinding`, `blindKit`, `unblindLabels`).
  - New `lib/eval/mergeLabels.js` (pure): merge a label map into manifest
    entry arrays; existing labels are replaced, never silently kept.
  - `scripts/label-app.js` (shell): zero-dependency `node:http` server.
  - `scripts/import-labels.js` (shell): read labels.json → `validateLabel` →
    `mergeLabels` → write `manifest.json` / `anchors.json`, all-or-nothing.
- **Server** builds its dataset at startup: `loadCases` over both manifests +
  `runRules` per case + the raw documents for the source view. No watch mode;
  restart to pick up fixture changes.
- **UI** is one static HTML file with inline vanilla JS/CSS (no framework, no
  build step — DB plain-JS rule). State lives in memory; every mutation
  autosaves via `PUT /api/labels` (debounced), so nothing depends on
  `localStorage`.
- **Rank convention (decision):** within a cohort, rank `1` = best design,
  dense ranks, no ties. The UI derives ranks from drag-order; the labeler never
  types a number. `LABELING-GUIDE.md` states the same convention.
- **Cohorts (assumption, see Open Questions):** a committed
  `test/fixtures/golden/cohorts.json` maps case name → cohort id. Until the
  expert defines cohorts, defaults are `generated` (17 cases) and `anchors`
  (10 cases).
- **Blind labeling (added post-review, 2026-07-05):** fixture names like
  `broken-orphan` leak the expected verdict, so the browser only ever sees
  stable pseudonyms (`case-07`, `cohort-2`) in hash order; the server maps
  back to real names on save, and labels.json/manifests are unaffected.
  Fixture metadata was neutralized to match (2026-07-06): verdict-bearing
  titles/descriptions and the seeded term name were rewritten at the YAML/
  generator source and the fixtures regenerated, `expectedRuleIds` unchanged.
  Known residual: rule ids and genuine fixture content still show — content
  cannot be blinded without falsifying the artifact.
- **Guide rules become affordances:** `overall: borderline` warns until at
  least one subjective issue explains the tension (the schema has no
  case-level note field); issue notes are required (no-deferral wording stays
  a human rule — the app does not police phrasing); issue `term` is a dropdown
  of the case's real term IRIs (citation validity by construction).
- **Save target (decision, revised):** saves land in a tracked
  `test/fixtures/golden/labels.json`, not directly in the manifests —
  hand-off = branch push of that file; manifest edits happen only via the
  reviewed import step.

## Data flows

```
manifest.json + anchors.json + fixtures        (committed, trusted)
        │  loadCases + runRules (startup)
        ▼
label-app server (127.0.0.1 only, blinded at this boundary)
        │  GET /            → app page
        │  GET /api/kit     → {cases (pseudonymous), terms, findings,
        │                      raw sources, existing labels}
        │  PUT /api/labels  → unblind → validateLabel per case
        ▼
test/fixtures/golden/labels.json                 (tracked, working tree)
        │  npm run label:import   (validateLabel → mergeLabels)
        ▼
manifest.json / anchors.json label fields        (reviewed commit)
```

Trust boundaries: everything runs on the labeler's machine against their own
checkout. The browser page is same-origin with the server; no third-party
requests, no CDN assets. The only untrusted input is the label payload itself,
validated against the closed label vocabulary before any write.

## DB schema changes

None. No database exists; the "schema" is the manifest JSON schema
(`lib/eval/manifestSchema.js`), whose Phase 2 label fields already exist and
are unchanged. `cohorts.json` is a new committed fixture file, validated by a
small check in the loader (every name must be a known case).

## API endpoints and scope

Local-only HTTP, bound to `127.0.0.1`, default port `8642` (flag-overridable).
Not deployed anywhere; lifetime = the labeling session.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/` | The app page (static, inline assets). |
| GET | `/api/kit` | Blinded cases (pseudonymous names/cohorts), flattened terms, raw source documents, deterministic findings, and any previously saved labels (so a session resumes from labels.json on disk). |
| PUT | `/api/labels` | Full label state as JSON, keyed by pseudonym. Server unblinds to real names, validates every label, and writes exactly one file: `test/fixtures/golden/labels.json`. Any other path is impossible — the output path is a constant, never derived from the request. |

No auth (single local user), no CORS allowances (same-origin only), no other
methods or paths (404).

## Personal information impact

- **Categories:** one — the labeler's identifier (`labeledBy`) and label date
  (`labeledAt`). No other personal data is collected, displayed, or stored.
- **Purpose:** provenance of the expert label, required by the design doc
  (§2.2) so the golden standard is attributable and adjudicable.
- **Storage / transmission:** entered once in the UI, sent only over the
  localhost loopback, stored in labels.json and ultimately in the committed
  manifests. **This repo is public**, so `labeledBy` becomes public data — the
  spec proposes a short opaque handle (e.g. initials or a role id), not a full
  name or email. Flagged as an open question for privacy review.
- **Minimization:** nothing beyond the two provenance fields; the app sets
  `labeledAt` automatically so no free-text field invites over-sharing.

## Security considerations

- **Misuse surface:** a localhost HTTP server that writes files. Mitigations:
  bind `127.0.0.1` (never `0.0.0.0`); write only to two constant paths inside
  the repo; reject payloads over a small size cap; validate every value against
  the closed vocabulary before writing.
- **DNS-rebinding / cross-site:** the API mutates local files, so `PUT
  /api/labels` checks the `Host` header is `127.0.0.1`/`localhost` and rejects
  requests with an `Origin` not matching the server origin. No CORS headers are
  emitted.
- **Data sources:** the fixtures and manifests are committed, reviewed repo
  content (trusted). Vocab content rendered in the UI is public by the
  project's own resolvability standard. No secrets are read or served; the
  server never reads outside `test/fixtures/` and `lib/`.
- **No LLM in the path** — the app is deterministic tooling *for* the eval
  gate, so the eval-gate rule imposes no gate of its own here.
- **Audit trail:** labels land in git via reviewed commits (labels branch, then
  import commit), so who labeled what, and when, is traceable — no silent
  mutation of the golden standard.

## Open questions

**All deferred per review (2026-07-04)** {>>re c1: proceeding on the inline
defaults — cohorts = generated/anchors split, labeledBy = short opaque handle,
save target = tracked CSVs + separate import, adjudication = branches + PR
review. Each question stays open for the wider SDLC review.<<}{#c2}

1. **Cohort definitions** — who defines them and at what granularity? The
   design doc implies the expert is told the cohorts; the default
   `generated`/`anchors` split is a placeholder. Needs a decision from the
   labeling owner before ρ is meaningful.
2. **`labeledBy` in a public repo** — confirm with privacy review that a short
   opaque handle is acceptable in the committed manifest, or whether provenance
   should live somewhere non-public (e.g. an internal record keyed by a label
   hash).
3. **Save target** — RESOLVED 2026-07-06: a tracked
   `test/fixtures/golden/labels.json` + separate import. The CSV format this
   question originally assumed was removed along with the spreadsheet kit.
4. **Second labeler / adjudication** — the guide recommends two labelers. This
   app is single-user; two labelers would use two branches and reconcile in
   review. Is that sufficient, or does adjudication need tooling (out of scope
   here, but say so explicitly)?

---

*Distribute to Engineering, DevOps, CTO, and Privacy Officer for review before
implementation (DB SDLC).*

---
comments:
  c1:
    body: Defer open questions for now
    by: user
    at: 2026-07-04T18:46:28.798Z
  c2:
    body: >-
      Acknowledged — proceeding on the inline defaults (cohorts =
      generated/anchors split, labeledBy = short opaque handle, save target =
      tracked CSVs + separate import, adjudication = branches + PR review).
      Questions remain open for the wider SDLC review.
    by: claude
    at: 2026-07-04T18:50:00.000Z
    re: c1
