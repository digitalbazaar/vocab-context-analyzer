# Spec — yml2vocab build-check stage
**Status:** Implemented **Author:** DJ Scruggs **Date:** 2026-06-30 **Relates to:** `docs/SPEC.md` §1 ("must also run against the output of third-party tools that auto-generate vocabularies... so we can judge those generators")

* * *
## 1. Problem
The analyzer's input contract today is **generated artifacts**: `--vocab` and `--context` JSON-LD documents that yml2vocab has already produced. Every defect yml2vocab catches _at build time_ is therefore invisible to the analyzer — if the build fails, there is no artifact to feed it.

For example, a `vocabulary.yml` whose property declares a range that yml2vocab cannot resolve — an undeclared prefix, or a term that is neither a defined class nor a datatype — causes yml2vocab to throw at build time rather than emit artifacts:

```
yml2vocab cannot build the vocabulary: URL for prefix "foo" not found.
```

This is the most severe class of vocabulary defect — a vocab that does not compile — and it is exactly the class the analyzer currently never sees, because it only ever runs on vocabularies that already cleared this bar.
## 2. Goal
Add a build-check stage that runs yml2vocab against a `vocabulary.yml` **source** and reports a build failure as a finding, **without** disturbing the existing pure JSON-LD-graph rule engine.

Non-goals: reimplementing yml2vocab's validation; checking tooling/CI/copyright (separate "repo-health" thread); Turtle output.
## 3. Design
### 3.1 Where the stage sits
A new stage **upstream** of the existing rules — not a `lib/rules/` rule. The existing engine stays pure: model in, findings out, no yml2vocab.

```
--yaml vocabulary.yml
    │
    ▼
[ build stage ]  run yml2vocab
    │
    ├── build fails ──▶ finding: build/yml2vocab-fails (error) ──▶ STOP
    │                   (no artifacts exist; downstream rules cannot run)
    │
    └── build succeeds ─▶ generated {vocab, context}
                            │
                            ▼
                       existing loadModel + runRules (unchanged)
```

When the build fails there is nothing to analyze downstream, so the build finding is terminal for that run (exit code 1, like any error finding).
### 3.2 CLI contract
A new mutually-exclusive input mode alongside the current one:

| Mode | Inputs | Behavior |
| --- | --- | --- |
| artifact (today) | `--vocab` + `--context` | unchanged |
| source (new) | `--yaml <vocabulary.yml>` | build, then analyze generated output |

`--yaml` is incompatible with `--vocab`/`--context`; supplying both is a usage
error (exit 2), consistent with current arg handling. Flag name resolved to
`--yaml` (over `--source`) per review — it names the input format explicitly.
Build mode is strictly **opt-in**: artifact mode and the default behavior are
unchanged, so consumers without CI can run the build check on demand while
those with CI are unaffected.
### 3.3 Functional core / imperative shell
The build is IO (invokes a generator), so it belongs in the **shell**, mirroring `loadModel`. Proposed: `lib/shell/buildFromSource.js`.

- Pure boundary: shell calls yml2vocab, catches the thrown `Error`, and returns either `{vocab, context}` or `{buildFinding}` — a plain object the core consumes. yml2vocab never reaches the pure layer.
  
- The build finding is created with the existing `createFinding` factory so it flows through `report.js` / `exitCodeFor` exactly like a rule finding.
  
### 3.4 The finding
```
id:          build/yml2vocab-fails
severity:    error
artifact:    vocab          (the source vocabulary)
message:     "yml2vocab cannot build the vocabulary: <yml2vocab message>."
remediation: derived from the message where possible; otherwise generic
             "Resolve the yml2vocab build error in vocabulary.yml."
```

The yml2vocab message is human-readable and specific (names the property and the offending range), so it is passed through rather than re-derived.
### 3.5 Dependency strategy
yml2vocab is currently a **build-time-only** tool (`scripts/build-fixtures.js` via `npx`), deliberately _not_ a project dependency, so the core analyzer stays light. Keep that property:

In all options yml2vocab is loaded **lazily** inside `buildFromSource.js`, only when `--yaml` is used; artifact mode never imports it and keeps zero new runtime deps. The question is only how the manifest declares the requirement:

| | `optionalDependency` | `peerDependency` | plain `dependency` |
|---|---|---|---|
| Artifact-mode user `npm install` | installs yml2vocab silently (best-effort; no failure if it can't) | does **not** install it; warns if absent | always installs it |
| `--yaml` user | already present | must install yml2vocab themselves | already present |
| Install weight for the common (artifact) case | medium — pulled in but non-fatal | **zero** | heavy — always pulled in |
| Failure mode when missing | none (we detect at runtime, exit 2 + hint) | npm peer warning at install + our runtime exit 2 | n/a |
| Version coupling visible to consumer | hidden | **explicit** (consumer pins the peer) | hidden, we own the pin |

**Pros / cons summary:**

- **optional** — _pro:_ `--yaml` "just works" for most installers without a second step; _con:_ still downloads yml2vocab for everyone, and "optional" semantics are inconsistent across package managers (npm installs by default, some CI flags skip it), so we must still handle the missing case anyway.
  
- **peer** — _pro:_ truly zero cost for artifact-mode users, and makes the yml2vocab version coupling explicit (the consumer pins it, which matches the eval-gate concern in §4); _con:_ `--yaml` users need an explicit install, and peer-dep UX varies by npm version.
  
- **plain dependency** — simplest mental model, but pays the full install cost on every consumer for a feature most won't use; rejected.
  

**Decision: `peerDependency`** (resolved in review). The version coupling in §4
is real, and a peer dep surfaces it to the consumer — they pin the yml2vocab
version the eval gate is calibrated against — rather than burying it. Artifact
mode pays zero install cost.

Regardless of choice: if `--yaml` is used and yml2vocab is not resolvable → usage error (exit 2) with an install hint.
## 4. Eval gate (required — LLM-free but still version-coupled)
yml2vocab's accept/reject behavior and messages can change across versions, so the check's stability is coupled to yml2vocab. Per `docs/SPEC.md` §7 discipline, gate it:

1. **Measurable outcome:** a `vocabulary.yml` that yml2vocab rejects produces exactly one `build/yml2vocab-fails` error; one that builds produces none and proceeds to the normal rules.
  
2. **Golden YAML fixtures** under `test/fixtures/build/`:
  

- `builds.yml` — minimal valid source (should build, 0 build findings).
  
- `bad-range.yml` — synthetic source whose property declares an unresolvable range (an undeclared prefix). Should fail the build. Models a real-world defect class observed in production vocabularies without reproducing any private source.
  

3. **Programmatic check:** assert the finding id + severity + that downstream rules are skipped on failure. Exact-match on the oracle, like the existing golden set.
  
4. **Regression detection:** pin the yml2vocab version; the fixtures fail loudly if a yml2vocab upgrade changes its accept/reject boundary, surfacing the coupling instead of hiding it.
  

The synthetic `bad-range.yml` is the "should-fail" corpus entry, complementing the real-context fixtures from PR #2 on the should-pass side.
## 5. Risks / open questions
1. {==**yml2vocab error surface is a string, not a code.** Remediation parsing is best-effort; we pass the message through. Acceptable?==}{>>acceptable<<}{id="c1" by="user" at="2026-06-30T19:50:28.811Z"}
  
2. {==**optionalDependency vs. peerDependency** — optional keeps `npm install` quiet for artifact-mode users; peer makes the requirement explicit. Lean optional. Agree?==}{>>give me pros and cons<<}{id="c2" by="user" at="2026-06-30T19:51:01.376Z"}
  
3. {==**Scope creep guard:** this stage deliberately does _not_ grow into the tooling/copyright health checks. Those stay a separate spec. Confirm we want them kept apart.==}{>>yes but we will want those checks eventually<<}{id="c3" by="user" at="2026-06-30T19:51:21.536Z"}
  
4. {==**Does the build stage belong in this tool at all,**==}{>>yes as an option, not everyone sets up ci<<}{id="c4" by="user" at="2026-06-30T19:52:09.813Z"} **vs. each vocab repo's own CI?** Argument for here: the analyzer's stated purpose (§1) is to _judge generators' output_, and "won't build" is the strongest such judgment; it also lets one tool grade a whole corpus uniformly.
  
## 6. Resolved decisions (from review 2026-06-30)

| # | Decision | Source |
| --- | --- | --- |
| Flag name | **`--yaml`** (not `--source`) — names the input format explicitly | c5 |
| Build finding | **Terminal** — a build failure skips downstream rules; no artifacts exist to analyze | c6 |
| In-tool vs. CI | **In-tool, opt-in** — offered as a flag because not every repo sets up CI; default/artifact mode unchanged | c4 |
| Error surface | Pass yml2vocab's message through; best-effort remediation — **accepted** | c1 |
| Dependency | **`peerDependency`** — surfaces the yml2vocab version coupling (§4) to the consumer rather than burying it; zero install cost for artifact-mode users | c2 |
| Scope | Repo-health (tooling/copyright) checks kept **separate but planned**; likely a shared "non-graph checks" umbrella later | c3 |

All decisions resolved — spec is ready to implement.

---

```yaml
comments:
  - id: r1
    re: c1
    by: claude
    at: 2026-06-30T20:05:00Z
    body: >-
      Confirmed accepted. The message is passed through verbatim in §3.4; no
      brittle parsing of yml2vocab's wording.
  - id: r2
    re: c2
    by: claude
    at: 2026-06-30T20:05:00Z
    body: >-
      Resolved: peerDependency. The yml2vocab version coupling in §4 is real,
      and a peer dep makes the consumer pin the version the eval gate is
      calibrated against rather than burying it; artifact mode pays zero install
      cost. Full pros/cons retained in §3.5 for the record.
  - id: r3
    re: c3
    by: claude
    at: 2026-06-30T20:05:00Z
    body: >-
      Updated §2 and the §6 table: repo-health (tooling/copyright) checks are
      planned, not abandoned. This build-check and those checks share a theme —
      judging the repo/source rather than the generated graph — so they likely
      belong under one "non-graph checks" umbrella when both exist.
  - id: r4
    re: c4
    by: claude
    at: 2026-06-30T20:05:00Z
    body: >-
      Agreed and baked in: build mode is strictly opt-in via --yaml (§3.2).
      Default and artifact modes are unchanged, so a repo without CI can run it
      on demand and a repo with CI is unaffected.
  - id: r5
    re: c5
    by: claude
    at: 2026-06-30T20:05:00Z
    body: Renamed --source to --yaml throughout. Recorded in §6.
  - id: r6
    re: c6
    by: claude
    at: 2026-06-30T20:05:00Z
    body: >-
      Confirmed terminal. §3.1 and §6 state a build failure stops the run before
      the rule engine, since no generated artifacts exist to analyze.
```
