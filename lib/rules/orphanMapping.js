/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'pair/orphan';

/**
 * A context mapping that points into the vocabulary's own namespace but has no
 * matching vocab term is an orphan (SPEC section 5.1, pairing checks). Mappings
 * to external IRIs (outside the vocab namespace) are legitimate and ignored, as
 * are unresolved (`null`) IRIs.
 *
 * Requires `model.vocab.namespace` to decide what is "into" the vocab; if it is
 * absent, the rule cannot distinguish orphans from external terms and emits
 * nothing.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per orphan mapping.
 */
export function orphanMapping(model) {
  const {namespace} = model.vocab;
  if(typeof namespace !== 'string' || namespace.length === 0) {
    return [];
  }
  const vocabIris = new Set(model.vocab.terms.map(t => t.iri));

  const findings = [];
  for(const {term, iri} of model.context.mappings) {
    if(typeof iri !== 'string' || iri.length === 0) {
      continue;
    }
    if(iri.startsWith(namespace) && !vocabIris.has(iri)) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.error,
        artifact: ARTIFACT.pairing,
        term,
        message: `Context term "${term}" maps to <${iri}>, which is in the ` +
          'vocabulary namespace but has no vocabulary definition.',
        remediation: 'Define the term in the vocabulary, or remove the mapping.'
      }));
    }
  }
  return findings;
}
