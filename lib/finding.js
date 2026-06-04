/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * Severity of a finding. Errors are hard CI failures; warnings and info are
 * advisory. See SPEC section 5.1 / 11.1.3 for the severity policy.
 */
export const SEVERITY = Object.freeze({
  error: 'error',
  warning: 'warning',
  info: 'info'
});

/**
 * What produced the finding. Phase 1 is entirely `deterministic`; phase 2 adds
 * `llm` (see SPEC section 5.2).
 */
export const SOURCE = Object.freeze({
  deterministic: 'deterministic',
  llm: 'llm'
});

/**
 * Which artifact the finding concerns (SPEC section 3.3).
 */
export const ARTIFACT = Object.freeze({
  vocabulary: 'vocabulary',
  context: 'context',
  pairing: 'pairing'
});

/**
 * A single analyzer finding (SPEC section 6.1).
 *
 * @typedef {object} Finding
 * @property {string} id - Stable rule id, e.g. `"ctx/iri-collision"`.
 * @property {string} severity - One of {@link SEVERITY}.
 * @property {string} source - One of {@link SOURCE}.
 * @property {string} artifact - One of {@link ARTIFACT}.
 * @property {string} message - Human-readable description.
 * @property {string} [term] - The specific term/IRI implicated.
 * @property {string} [remediation] - Suggested fix.
 */

/**
 * Create a validated {@link Finding} (SPEC section 6.1).
 *
 * @param {object} options - The finding fields.
 * @param {string} options.id - Stable rule id, e.g. `"ctx/iri-collision"`.
 * @param {string} options.severity - One of {@link SEVERITY}.
 * @param {string} options.artifact - One of {@link ARTIFACT}.
 * @param {string} options.message - Human-readable description.
 * @param {string} [options.source] - One of {@link SOURCE}; defaults to
 *   `deterministic`.
 * @param {string} [options.term] - The specific term/IRI implicated.
 * @param {string} [options.remediation] - Suggested fix.
 *
 * @returns {object} The frozen finding.
 */
export function createFinding({
  id, severity, artifact, message, source = SOURCE.deterministic, term,
  remediation
} = {}) {
  if(typeof id !== 'string' || id.length === 0) {
    throw new TypeError('"id" must be a non-empty string.');
  }
  if(!Object.hasOwn(SEVERITY, severity)) {
    throw new TypeError(
      `"severity" must be one of ${_keys(SEVERITY)}; got "${severity}".`);
  }
  if(!Object.hasOwn(SOURCE, source)) {
    throw new TypeError(
      `"source" must be one of ${_keys(SOURCE)}; got "${source}".`);
  }
  if(!Object.hasOwn(ARTIFACT, artifact)) {
    throw new TypeError(
      `"artifact" must be one of ${_keys(ARTIFACT)}; got "${artifact}".`);
  }
  if(typeof message !== 'string' || message.length === 0) {
    throw new TypeError('"message" must be a non-empty string.');
  }

  const finding = {id, severity, source, artifact, message};
  if(term !== undefined) {
    finding.term = term;
  }
  if(remediation !== undefined) {
    finding.remediation = remediation;
  }
  return Object.freeze(finding);
}

function _keys(enumObject) {
  return Object.keys(enumObject).join(', ');
}
