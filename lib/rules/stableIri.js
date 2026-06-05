/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'vocab/unstable-iri';

// a version-looking segment: v1 / v2.0 / 1.0 bounded by IRI delimiters or ends
const VERSION_SEGMENT =
  /[#/](v?\d+(\.\d+)*)(?=[#/]|$)/i;

/**
 * Term IRIs should be stable: embedding a version number (e.g. `/v2#` or
 * `/1.0/`) ties the term's identity to a release and breaks when the vocabulary
 * is versioned (SPEC section 5.1, IRI stability heuristics). Reported as a
 * warning.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per term with a versioned IRI.
 */
export function stableIri(model) {
  const findings = [];
  for(const term of model.vocab.terms) {
    if(VERSION_SEGMENT.test(term.iri)) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.warning,
        artifact: ARTIFACT.vocabulary,
        term: term.iri,
        message: `Term IRI <${term.iri}> embeds a version number, tying the ` +
          'term identity to a release.',
        remediation: 'Use a version-free, stable IRI for the term.'
      }));
    }
  }
  return findings;
}
