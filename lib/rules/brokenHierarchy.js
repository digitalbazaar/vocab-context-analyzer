/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'vocab/broken-hierarchy';

// the reference properties whose targets must be defined terms when they point
// into the vocabulary's own namespace
const REFERENCE_KEYS = [
  ['subClassOf', 'rdfs:subClassOf'],
  ['subPropertyOf', 'rdfs:subPropertyOf'],
  ['domain', 'rdfs:domain'],
  ['range', 'rdfs:range']
];

/**
 * A `rdfs:subClassOf` / `subPropertyOf` / `domain` / `range` reference that
 * points into the vocabulary's own namespace must name a defined term;
 * otherwise it is a dangling reference (SPEC section 5.1, broken
 * subclass/subproperty references). Reported as an error.
 *
 * References to external terms (outside the vocab namespace) are legitimate and
 * ignored. Requires `model.vocab.namespace`; without it the rule cannot tell
 * internal from external references and emits nothing.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per broken internal reference.
 */
export function brokenHierarchy(model) {
  const {namespace} = model.vocab;
  if(typeof namespace !== 'string' || namespace.length === 0) {
    return [];
  }
  const defined = new Set(model.vocab.terms.map(term => term.iri));

  const findings = [];
  for(const term of model.vocab.terms) {
    for(const [key, label] of REFERENCE_KEYS) {
      for(const ref of term[key] ?? []) {
        if(ref.startsWith(namespace) && !defined.has(ref)) {
          findings.push(createFinding({
            id: ID,
            severity: SEVERITY.error,
            artifact: ARTIFACT.vocabulary,
            term: term.iri,
            message: `Term <${term.iri}> has a ${label} reference to ` +
              `<${ref}>, which is in the vocabulary namespace but is ` +
              'not defined.',
            remediation: 'Define the referenced term, or correct the reference.'
          }));
        }
      }
    }
  }
  return findings;
}
