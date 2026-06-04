/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, SEVERITY, SOURCE} from './finding.js';

/**
 * The programmatic schema check required by SPEC section 7.3: every emitted
 * `Finding[]` must validate. This is intentionally dependency-free and strict —
 * a malformed finding is a bug in a rule, so validation throws rather than
 * returning findings.
 */

const REQUIRED_STRINGS = ['id', 'message'];
const OPTIONAL_STRINGS = ['term', 'remediation'];
const ALLOWED_KEYS = new Set([
  'id', 'severity', 'source', 'artifact', 'message', 'term', 'remediation'
]);

/**
 * Validate an array of findings. Throws on the first violation.
 *
 * @param {object[]} findings - The findings to validate.
 *
 * @returns {object[]} The same array, when valid.
 */
export function validateFindings(findings) {
  if(!Array.isArray(findings)) {
    throw new TypeError('Findings must be an array.');
  }
  findings.forEach((finding, i) => _validateFinding(finding, i));
  return findings;
}

function _validateFinding(finding, index) {
  const at = `findings[${index}]`;
  if(finding === null || typeof finding !== 'object') {
    throw new TypeError(`${at} must be an object.`);
  }
  for(const key of Object.keys(finding)) {
    if(!ALLOWED_KEYS.has(key)) {
      throw new TypeError(`${at} has unexpected key "${key}".`);
    }
  }
  for(const key of REQUIRED_STRINGS) {
    if(typeof finding[key] !== 'string' || finding[key].length === 0) {
      throw new TypeError(`${at}.${key} must be a non-empty string.`);
    }
  }
  for(const key of OPTIONAL_STRINGS) {
    if(finding[key] !== undefined && typeof finding[key] !== 'string') {
      throw new TypeError(`${at}.${key} must be a string when present.`);
    }
  }
  _validateEnum(at, 'severity', finding.severity, SEVERITY);
  _validateEnum(at, 'source', finding.source, SOURCE);
  _validateEnum(at, 'artifact', finding.artifact, ARTIFACT);
}

function _validateEnum(at, key, value, enumObject) {
  if(!Object.hasOwn(enumObject, value)) {
    throw new TypeError(
      `${at}.${key} must be one of ${Object.keys(enumObject).join(', ')}; ` +
      `got "${value}".`);
  }
}
