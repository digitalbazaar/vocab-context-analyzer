/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

/**
 * Build a vocabulary and its `@context` from a `vocabulary.yml` source by
 * running yml2vocab, the imperative-shell stage that sits upstream of the rule
 * engine (SPEC-build-check §3.3).
 *
 * The yml2vocab package is a peer dependency, imported lazily so the analyzer's
 * artifact mode (`--vocab`/`--context`) never loads it. A build that throws is
 * reported
 * as a single terminal `build/yml2vocab-fails` finding rather than crashing the
 * run; because a failed build produces no artifacts, downstream rules cannot
 * run and the caller stops there.
 *
 * @param {string} yamlText - The `vocabulary.yml` source text.
 *
 * @returns {Promise<object>} On success, `{vocab, context}` — the generated
 *   JSON-LD documents as plain objects. On failure, `{buildFinding}` — a single
 *   error-severity finding. The yml2vocab instance itself is never returned.
 */
export async function buildFromSource(yamlText) {
  let yml2vocab;
  try {
    ({default: yml2vocab} = await import('yml2vocab'));
  } catch(e) {
    // peer dependency missing: surface as a build finding rather than crashing
    return {
      buildFinding: createFinding({
        id: 'build/yml2vocab-fails',
        severity: SEVERITY.error,
        artifact: ARTIFACT.vocabulary,
        message: 'yml2vocab is required for --yaml mode but is not ' +
          `installed: ${e.message}.`,
        remediation: 'Install the yml2vocab peer dependency: ' +
          '`npm install yml2vocab`.'
      })
    };
  }

  try {
    const generator = new yml2vocab.VocabGeneration(yamlText);
    // yml2vocab emits JSON text; parse to the plain objects loadModel consumes
    const vocab = JSON.parse(generator.getJSONLD());
    const context = JSON.parse(generator.getContext());
    return {vocab, context};
  } catch(e) {
    return {
      buildFinding: createFinding({
        id: 'build/yml2vocab-fails',
        severity: SEVERITY.error,
        artifact: ARTIFACT.vocabulary,
        message: `yml2vocab cannot build the vocabulary: ${e.message}.`,
        remediation: 'Resolve the yml2vocab build error in the vocabulary ' +
          'source, then re-run.'
      })
    };
  }
}
