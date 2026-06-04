# Vocabulary & Context Quality Analyzer _(vocab-context-analyzer)_

> Evaluates whether a JSON-LD/RDF vocabulary and its `@context` are well
> designed, and reports where they should be improved.

## Table of Contents

- [Background](#background)
- [Status](#status)
- [Install](#install)
- [Usage](#usage)
  - [Command line](#command-line)
  - [Library](#library)
- [Findings](#findings)
- [How it works](#how-it-works)
- [Spec](#spec)
- [Contribute](#contribute)
- [License](#license)

## Background

DB authors and consumes many JSON-LD vocabularies and `@context` documents.
This tool judges their design quality at author / generate time — the
design-time counterpart to `jsonld-document-loader`, which resolves contexts at
runtime. It also runs against the output of tools that auto-generate vocabs and
contexts, so those generators can be graded.

The analyzer is delivered in three phases:

1. **Deterministic CI core** — rule-based validator, pass/fail + structured report.
2. **LLM scoring layer** — design-quality score, for comparing artifacts and generators.
3. **Interactive reviewer** — conversational, human-in-the-loop authoring aid.

## Status

**Phase 1 (deterministic core) in progress.** A working CLI and library run a
set of deterministic checks over a JSON-LD vocabulary and its `@context` and
report structured findings. Phases 2–3 (LLM scoring, interactive review) are not
yet implemented.

Implemented so far:

- A pure rule engine producing structured `Finding[]` output.
- Deterministic rules for context IRI resolution, IRI collisions, vocab/context
  coverage, orphan mappings, and missing term definitions.
- An offline-by-default JSON-LD loader and a model builder for vocab + context
  files.
- A CLI with human-readable and JSON output and CI-friendly exit codes.

Input is JSON-LD only for now; Turtle/N-Triples input is deferred.

## Install

Node.js >= 22 is required.

```sh
npm install vocab-context-analyzer
```

## Usage

### Command line

```sh
vocab-context-analyzer --vocab <file> --context <file> [--format human|json]
```

| Option | Description |
| --- | --- |
| `--vocab <file>` | Path to the JSON-LD vocabulary document (required). |
| `--context <file>` | Path to the JSON-LD `@context` document (required). |
| `--format human\|json` | Output format (default: `human`). |
| `-h`, `--help` | Show help. |

Exit codes are designed for CI:

| Code | Meaning |
| --- | --- |
| `0` | No `error`-severity findings. Warnings and info do not fail the build. |
| `1` | At least one `error`-severity finding. |
| `2` | Usage, IO, or analysis error. |

Example:

```sh
vocab-context-analyzer \
  --vocab my-vocab.jsonld \
  --context my-vocab.context.jsonld
```

```
ERROR [pair/orphan] ghost
  Context term "ghost" maps to <https://example.org/v#ghost>, which is in the
  vocabulary namespace but has no vocabulary definition.
WARNING [pair/coverage] https://example.org/v#age
  Vocabulary term <https://example.org/v#age> is not mapped in the context.

1 error, 1 warning, 0 infos.
```

### Library

```js
import {loadModel, runRules} from 'vocab-context-analyzer';

const vocab = {/* parsed JSON-LD vocabulary */};
const context = {/* parsed JSON-LD @context */};

const model = await loadModel({vocab, context});
const findings = runRules(model);
```

By default, external IRIs are not fetched from the network. To resolve against a
snapshot of known contexts, supply a document loader:

```js
import {createOfflineDocumentLoader, loadModel} from 'vocab-context-analyzer';

// snapshots is any iterable of [url, document] pairs, e.g. a context package Map
const documentLoader = createOfflineDocumentLoader({snapshots});
const model = await loadModel({vocab, context, documentLoader});
```

To resolve over the network, build and pass a network-capable
[`jsonld`](https://github.com/digitalbazaar/jsonld.js) document loader instead.

## Findings

Each finding is a plain object:

| Field | Description |
| --- | --- |
| `id` | Stable rule id, e.g. `ctx/iri-collision`. |
| `severity` | `error`, `warning`, or `info`. |
| `source` | `deterministic` (phase 1) or `llm` (phase 2). |
| `artifact` | `vocabulary`, `context`, or `pairing`. |
| `term` | The specific term or IRI implicated (optional). |
| `message` | Human-readable description. |
| `remediation` | Suggested fix (optional). |

Deterministic rules currently implemented:

| Rule id | Severity | Checks |
| --- | --- | --- |
| `ctx/iri-unresolved` | error | Every context term resolves to an absolute IRI. |
| `ctx/iri-collision` | error | No two terms map to the same IRI. |
| `pair/coverage` | warning | Every vocabulary term appears in the context. |
| `pair/orphan` | error | No context mapping references a missing vocab term. |
| `vocab/no-definition` | warning | Every term has an `rdfs:label` or `rdfs:comment`. |

## How it works

The analyzer follows a functional-core / imperative-shell design:

- The **shell** (`lib/shell/`) does IO: it loads files, resolves the `@context`
  via `jsonld.js`, and builds an in-memory, already-resolved model. Resolution
  is offline by default.
- The **core** (`lib/rules/`, `lib/runRules.js`) is pure: it takes the resolved
  model and returns a sorted, schema-validated `Finding[]`. No network, no disk.

This keeps the rule logic deterministic and trivially unit-testable. See
[docs/SPEC.md](docs/SPEC.md) for the full design.

## Spec

See [docs/SPEC.md](docs/SPEC.md) for the full technical spec — scope, the
deterministic-vs-LLM judgment split, architecture, eval strategy, and deferred
open questions. The phase-1 implementation plan is in
[docs/PHASE1-PLAN.md](docs/PHASE1-PLAN.md).

## Contribute

See [CONTRIBUTING.md](https://github.com/digitalbazaar/bedrock/blob/main/CONTRIBUTING.md)
for the Digital Bazaar contribution and commit-message conventions.

PRs accepted. Never commit directly to `main`.

## License

[BSD-3-Clause](LICENSE) © Digital Bazaar
