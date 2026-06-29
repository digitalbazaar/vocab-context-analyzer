/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'ctx/unsafe-vocab';

// an absolute IRI has a scheme followed by `:` (e.g. `https:`, `urn:`). a safe
// top-level @vocab must be absolute so term expansion does not depend on the
// document base. a blank-node prefix (`_:`) is a scheme-like form but produces
// blank nodes, which break deterministic canonicalization, so it is unsafe.
const ABSOLUTE_IRI = /^[a-z][a-z0-9+.-]*:/i;

/**
 * The top-level `@vocab` in a context must be an absolute IRI. A relative
 * `@vocab`, an empty string, or a blank-node prefix (`_:`) makes term expansion
 * depend on the document base or emit blank nodes, breaking deterministic
 * canonicalization (SPEC section 5.1, context checks — yml2vocab's
 * `set_vocab` flags this as a security risk). Reported as an error. When the
 * raw context is unavailable, or declares no top-level `@vocab`, the rule
 * emits nothing.
 *
 * This rule concerns only the top-level `@vocab` key; a term-level
 * `"@type": "@vocab"` coercion is unrelated and is never flagged.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} A single finding when the top-level `@vocab` is unsafe.
 */
export function unsafeVocab(model) {
  const raw = model.context.raw;
  if(raw === null || typeof raw !== 'object') {
    return [];
  }
  const vocab = raw['@vocab'];
  if(vocab === undefined) {
    return [];
  }
  if(typeof vocab === 'string' && vocab.length > 0 &&
    !vocab.startsWith('_:') && ABSOLUTE_IRI.test(vocab)) {
    return [];
  }
  return [createFinding({
    id: ID,
    severity: SEVERITY.error,
    artifact: ARTIFACT.context,
    message: `Top-level @vocab "${vocab}" is not an absolute IRI; term ` +
      'expansion depends on the document base or emits blank nodes, ' +
      'breaking deterministic canonicalization.',
    remediation: 'Set @vocab to an absolute IRI, or remove it.'
  })];
}
