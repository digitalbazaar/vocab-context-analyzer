/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * Validator for a golden-set manifest entry (Phase 2 eval gate, design doc
 * section 2). The manifest is the eval's oracle: its Phase 1 fields
 * (`expectedRuleIds`) drive the deterministic recall gate, and its additive
 * Phase 2 label fields (`overall`, `designRank`, `subjectiveIssues`) drive the
 * LLM-scoring metrics. This validator keeps the manifest honest as it grows.
 *
 * Strict and dependency-free, mirroring {@link module:findingSchema}: a
 * malformed entry is a defect in the golden set, so validation throws rather
 * than returning a result.
 */

const REQUIRED_STRINGS = ['name', 'vocab', 'context'];
const OPTIONAL_STRINGS = ['labeledBy', 'labeledAt'];
const ALLOWED_KEYS = new Set([
  'name', 'vocab', 'context', 'expectedRuleIds',
  'overall', 'designRank', 'subjectiveIssues', 'labeledBy', 'labeledAt'
]);

// the overall design verdict bands (design doc section 2.2)
const OVERALL = new Set(['good', 'bad', 'borderline']);
// the subjective-issue categories the LLM layer judges (design doc section 1)
const ISSUE_CATEGORY = new Set([
  'naming', 'definition', 'modeling', 'coverage'
]);
const ISSUE_KEYS = new Set(['term', 'category', 'note']);

/**
 * Validate one manifest entry. Throws on the first violation.
 *
 * @param {object} entry - The manifest entry to validate.
 *
 * @returns {object} The same entry, when valid.
 */
export function validateManifestEntry(entry) {
  if(entry === null || typeof entry !== 'object') {
    throw new TypeError('Manifest entry must be an object.');
  }
  for(const key of Object.keys(entry)) {
    if(!ALLOWED_KEYS.has(key)) {
      throw new TypeError(`Manifest entry has unexpected key "${key}".`);
    }
  }
  for(const key of REQUIRED_STRINGS) {
    if(typeof entry[key] !== 'string' || entry[key].length === 0) {
      throw new TypeError(
        `Manifest entry "${key}" must be a non-empty string.`);
    }
  }
  for(const key of OPTIONAL_STRINGS) {
    if(entry[key] !== undefined && typeof entry[key] !== 'string') {
      throw new TypeError(
        `Manifest entry "${key}" must be a string when present.`);
    }
  }
  _validateRuleIds(entry.expectedRuleIds);
  _validateOverall(entry.overall);
  _validateDesignRank(entry.designRank);
  _validateSubjectiveIssues(entry.subjectiveIssues);
  return entry;
}

function _validateRuleIds(value) {
  // expectedRuleIds is the Phase 1 oracle: an array of rule-id strings ([] for
  // a clean case). Optional only so a not-yet-labeled draft entry can omit it.
  if(value === undefined) {
    return;
  }
  if(!Array.isArray(value) ||
    !value.every(id => typeof id === 'string' && id.length > 0)) {
    throw new TypeError(
      'Manifest entry "expectedRuleIds" must be an array of rule-id strings.');
  }
}

function _validateOverall(value) {
  if(value !== undefined && !OVERALL.has(value)) {
    throw new TypeError(
      `Manifest entry "overall" must be one of ${[...OVERALL].join(', ')}; ` +
      `got "${value}".`);
  }
}

function _validateDesignRank(value) {
  if(value !== undefined &&
    (!Number.isInteger(value) || value < 0)) {
    throw new TypeError(
      'Manifest entry "designRank" must be a non-negative integer.');
  }
}

function _validateSubjectiveIssues(value) {
  if(value === undefined) {
    return;
  }
  if(!Array.isArray(value)) {
    throw new TypeError(
      'Manifest entry "subjectiveIssues" must be an array.');
  }
  value.forEach((issue, i) => _validateIssue(issue, i));
}

function _validateIssue(issue, index) {
  const at = `subjectiveIssues[${index}]`;
  if(issue === null || typeof issue !== 'object') {
    throw new TypeError(`Manifest entry ${at} must be an object.`);
  }
  for(const key of Object.keys(issue)) {
    if(!ISSUE_KEYS.has(key)) {
      throw new TypeError(`Manifest entry ${at} has unexpected key "${key}".`);
    }
  }
  if(typeof issue.term !== 'string' || issue.term.length === 0) {
    throw new TypeError(
      `Manifest entry ${at}.term must be a non-empty string.`);
  }
  if(!ISSUE_CATEGORY.has(issue.category)) {
    throw new TypeError(
      `Manifest entry ${at}.category must be one of ` +
      `${[...ISSUE_CATEGORY].join(', ')}; got "${issue.category}".`);
  }
  if(typeof issue.note !== 'string' || issue.note.length === 0) {
    throw new TypeError(
      `Manifest entry ${at}.note must be a non-empty string.`);
  }
}
