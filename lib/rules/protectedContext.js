/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'ctx/unprotected';

/**
 * Digital Bazaar contexts should declare `@protected` so terms cannot be
 * silently redefined by a later context — a security and integrity concern
 * (SPEC section 5.1, context checks). Reported as a warning. When the raw
 * context is unavailable the rule emits nothing (it cannot tell).
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} A single finding when the context is not protected.
 */
export function protectedContext(model) {
  const raw = model.context.raw;
  if(raw === null || typeof raw !== 'object') {
    return [];
  }
  if(raw['@protected'] === true) {
    return [];
  }
  return [createFinding({
    id: ID,
    severity: SEVERITY.warning,
    artifact: ARTIFACT.context,
    message: 'Context is not @protected; terms can be silently redefined ' +
      'by a later context.',
    remediation: 'Add "@protected": true to the context.'
  })];
}
