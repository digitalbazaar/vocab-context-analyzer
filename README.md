# Vocabulary & Context Quality Analyzer _(vocab-context-analyzer)_

> Evaluates whether a JSON-LD/RDF vocabulary and its `@context` are well
> designed, and reports where they should be improved.

## Table of Contents

- [Background](#background)
- [Status](#status)
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

Early. This repo currently holds the base technical spec only; no
implementation yet.

## Spec

See [docs/SPEC.md](docs/SPEC.md) for the full technical spec — scope, the
deterministic-vs-LLM judgment split, architecture, eval strategy, and deferred
open questions.

## Contribute

See [CONTRIBUTING.md](https://github.com/digitalbazaar/bedrock/blob/main/CONTRIBUTING.md)
for the Digital Bazaar contribution and commit-message conventions.

PRs accepted. Never commit directly to `main`.

## License

[BSD-3-Clause](LICENSE) © Digital Bazaar
