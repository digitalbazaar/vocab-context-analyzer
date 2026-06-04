/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'pair/coverage';

/**
 * Every vocabulary term should appear in the context (matched by IRI, so
 * aliases count). Incomplete coverage is a WARNING, not an error, per the
 * resolved severity policy (SPEC section 11.1.3).
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per uncovered vocab term.
 */
export function coverage(model) {
  const contextIris = new Set(
    model.context.mappings
      .map(m => m.iri)
      .filter(iri => typeof iri === 'string' && iri.length > 0));

  const findings = [];
  for(const term of model.vocab.terms) {
    if(!contextIris.has(term.iri)) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.warning,
        artifact: ARTIFACT.pairing,
        term: term.iri,
        message: `Vocabulary term <${term.iri}> is not mapped in the context.`,
        remediation: 'Add a context mapping for the term, or confirm the ' +
          'omission is intentional.'
      }));
    }
  }
  return findings;
}
