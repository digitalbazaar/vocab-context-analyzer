/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'ctx/iri-unresolved';

/**
 * Every context mapping must resolve to an absolute IRI. A `null` IRI (the
 * shell could not resolve it) or a relative one is a hard error: it breaks
 * downstream JSON-LD processing (SPEC section 5.1, context checks).
 *
 * This rule does NOT check network reachability — that is the resolvability
 * check, which lives in the shell.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} Findings.
 */
export function contextIriResolves(model) {
  const findings = [];
  for(const {term, iri} of model.context.mappings) {
    if(!_isAbsoluteIri(iri)) {
      findings.push(createFinding({
        id: ID,
        severity: SEVERITY.error,
        artifact: ARTIFACT.context,
        term,
        message: `Context term "${term}" does not resolve to an absolute IRI.`,
        remediation: 'Define the prefix or use an absolute IRI.'
      }));
    }
  }
  return findings;
}

function _isAbsoluteIri(iri) {
  // an absolute IRI has a scheme, e.g. "https:" or "urn:"; we keep this simple
  // and deterministic — full IRI validation is not the goal here
  return typeof iri === 'string' && /^[a-z][a-z0-9+.-]*:/i.test(iri);
}
