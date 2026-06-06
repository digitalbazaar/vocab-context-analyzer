/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'vocab/missing-domain-range';

/**
 * A property should declare both `rdfs:domain` and `rdfs:range` so consumers
 * know what it applies to and what values it takes (SPEC section 5.1,
 * vocabulary checks). Reported as a warning; only properties are checked.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per property missing domain and/or range.
 */
export function domainRange(model) {
  const findings = [];
  for(const term of model.vocab.terms) {
    if(term.kind !== 'property') {
      continue;
    }
    const missing = [];
    if(!_has(term.domain)) {
      missing.push('rdfs:domain');
    }
    if(!_has(term.range)) {
      missing.push('rdfs:range');
    }
    if(missing.length > 0) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.warning,
        artifact: ARTIFACT.vocabulary,
        term: term.iri,
        message: `Property <${term.iri}> is missing ${missing.join(' and ')}.`,
        remediation: 'Declare the property\'s domain and range.'
      }));
    }
  }
  return findings;
}

function _has(values) {
  return Array.isArray(values) && values.length > 0;
}
