/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {contextIriResolves} from './rules/contextIriResolves.js';
import {coverage} from './rules/coverage.js';
import {iriCollision} from './rules/iriCollision.js';
import {orphanMapping} from './rules/orphanMapping.js';
import {termHasDefinition} from './rules/termHasDefinition.js';
import {validateFindings} from './findingSchema.js';

// explicit list of deterministic rules; a registry can come later if it earns
// its keep
const RULES = [
  contextIriResolves,
  iriCollision,
  coverage,
  orphanMapping,
  termHasDefinition
];

// errors sort before warnings before info
const SEVERITY_ORDER = {error: 0, warning: 1, info: 2};

/**
 * Run every deterministic rule over a resolved model and return the aggregated,
 * sorted, schema-validated findings (SPEC section 6, functional core).
 *
 * Pure: no IO, no network. Throws if any rule emits a malformed finding —
 * that is a bug in the rule, not a finding (SPEC section 7.3).
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} The sorted, validated findings.
 */
export function runRules(model) {
  const findings = [];
  for(const rule of RULES) {
    findings.push(...rule(model));
  }
  findings.sort(_compareFindings);
  return validateFindings(findings);
}

function _compareFindings(a, b) {
  const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
  if(bySeverity !== 0) {
    return bySeverity;
  }
  if(a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  const aTerm = a.term ?? '';
  const bTerm = b.term ?? '';
  return aTerm < bTerm ? -1 : aTerm > bTerm ? 1 : 0;
}
