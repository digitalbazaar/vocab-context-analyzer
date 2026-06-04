/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'ctx/iri-collision';

/**
 * No two distinct context terms may map to the same IRI without intent
 * (SPEC section 5.1, context checks). Unresolved (`null`/relative) IRIs are
 * ignored here — those are reported by `ctx/iri-unresolved`.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per colliding IRI group.
 */
export function iriCollision(model) {
  const byIri = new Map();
  for(const {term, iri} of model.context.mappings) {
    if(typeof iri !== 'string' || iri.length === 0) {
      continue;
    }
    const terms = byIri.get(iri);
    if(terms) {
      terms.push(term);
    } else {
      byIri.set(iri, [term]);
    }
  }

  const findings = [];
  for(const [iri, terms] of byIri) {
    if(terms.length > 1) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.error,
        artifact: ARTIFACT.context,
        term: iri,
        message: `Terms ${terms.map(t => `"${t}"`).join(', ')} all map to ` +
          `the same IRI <${iri}>.`,
        remediation: 'Give each term a distinct IRI, or remove the duplicate.'
      }));
    }
  }
  return findings;
}
