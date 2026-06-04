/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'vocab/no-definition';

/**
 * Every vocabulary term should carry a human-readable definition — an
 * `rdfs:label` or `rdfs:comment` (SPEC section 5.1, vocabulary checks). A term
 * with neither is a warning. Empty strings count as missing.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per undefined term.
 */
export function termHasDefinition(model) {
  const findings = [];
  for(const term of model.vocab.terms) {
    if(!_hasText(term.label) && !_hasText(term.comment)) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.warning,
        artifact: ARTIFACT.vocabulary,
        term: term.iri,
        message: `Vocabulary term <${term.iri}> has no rdfs:label or ` +
          'rdfs:comment.',
        remediation: 'Add a label and/or comment describing the term.'
      }));
    }
  }
  return findings;
}

function _hasText(value) {
  return typeof value === 'string' && value.length > 0;
}
