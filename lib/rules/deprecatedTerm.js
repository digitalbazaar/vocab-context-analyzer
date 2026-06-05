/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'vocab/deprecated-mapped';

/**
 * A term marked deprecated in the vocabulary (`owl:deprecated`) should not be
 * actively mapped in the context — doing so keeps steering consumers toward
 * it (SPEC section 5.1, deprecation handling). Reported as a warning on the
 * pairing.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per deprecated term still mapped.
 */
export function deprecatedTerm(model) {
  const mappedIris = new Set(
    model.context.mappings
      .map(m => m.iri)
      .filter(iri => typeof iri === 'string' && iri.length > 0));

  const findings = [];
  for(const term of model.vocab.terms) {
    if(term.deprecated && mappedIris.has(term.iri)) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.warning,
        artifact: ARTIFACT.pairing,
        term: term.iri,
        message: `Deprecated term <${term.iri}> is still mapped in the ` +
          'context.',
        remediation: 'Remove the mapping, or undeprecate the term if it is ' +
          'still in use.'
      }));
    }
  }
  return findings;
}
