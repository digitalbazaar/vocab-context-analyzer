/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * Deterministic eval-gate checks over LLM findings and renderings (Phase 2
 * eval gate, design doc section 3). These are pure functions in the functional
 * core: they take already-produced findings/renderings plus the resolved model
 * and return a structured verdict. No LLM call, no IO — the LLM ran upstream;
 * these judge its output against ground truth the model already carries.
 *
 * Until Phase 2 produces real LLM findings, these run against synthetic inputs
 * in tests; the contract (a finding with `source: 'llm'`, a cited `term`, and
 * an actionable `remediation`) is what Phase 2 must emit.
 */

// remediation text that defers instead of giving an actionable fix. SPEC
// section 5.2.1 / 7.3: deferrals count as failures, like hallucinations.
const DEFERRAL_PHRASES = [
  'it depends',
  'needs expert input',
  'needs more context',
  'cannot determine',
  'unclear',
  'consider whether'
];

/**
 * Citation validity (design doc section 3.3): every LLM finding must cite a
 * term that exists in the model. A finding with a missing or hallucinated term
 * fails the run.
 *
 * @param {object[]} findings - All findings (LLM and deterministic).
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {{valid: boolean, hallucinated: object[]}} The verdict and the
 *   offending LLM findings.
 */
export function citationValidity(findings, model) {
  const realIris = _termIris(model);
  const hallucinated = _llmFindings(findings).filter(
    finding => typeof finding.term !== 'string' || !realIris.has(finding.term));
  return {valid: hallucinated.length === 0, hallucinated};
}

/**
 * Deferral rate (design doc section 3.4, SPEC section 5.2.1): the share of LLM
 * findings that defer rather than recommend an actionable fix. Must be 0. A
 * finding defers if it carries an explicit `defer` flag, has no `remediation`,
 * or its remediation matches a known non-actionable phrase.
 *
 * @param {object[]} findings - All findings (LLM and deterministic).
 *
 * @returns {{rate: number, deferred: object[]}} The deferral rate in [0, 1]
 *   and the deferring LLM findings.
 */
export function deferralRate(findings) {
  const llm = _llmFindings(findings);
  if(llm.length === 0) {
    return {rate: 0, deferred: []};
  }
  const deferred = llm.filter(_isDeferral);
  return {rate: deferred.length / llm.length, deferred};
}

/**
 * English-rendering faithfulness (design doc section 3.5, SPEC section 5.2.2):
 * a plain-language rendering has a deterministic spine, so the rendered
 * subject/property/object must match the model. A rendering whose subject is
 * not a real term, or whose stated `rdfs:domain` / `rdfs:range` disagrees with
 * the term's actual domain/range, is unfaithful.
 *
 * @param {object[]} renderings - The rendered triples.
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {{faithful: boolean, unfaithful: object[]}} The verdict and the
 *   offending renderings.
 */
export function englishFaithfulness(renderings, model) {
  const byIri = new Map(model.vocab.terms.map(term => [term.iri, term]));
  const unfaithful = renderings.filter(
    rendering => !_isFaithful(rendering, byIri));
  return {faithful: unfaithful.length === 0, unfaithful};
}

function _isFaithful(rendering, byIri) {
  const term = byIri.get(rendering.subject);
  if(term === undefined) {
    // the rendered subject is not a real term
    return false;
  }
  if(rendering.property === 'rdfs:domain') {
    return (term.domain ?? []).includes(rendering.object);
  }
  if(rendering.property === 'rdfs:range') {
    return (term.range ?? []).includes(rendering.object);
  }
  // a property the spine does not constrain: subject existence is enough
  return true;
}

function _isDeferral(finding) {
  if(finding.defer === true) {
    return true;
  }
  const remediation = finding.remediation;
  if(typeof remediation !== 'string' || remediation.length === 0) {
    return true;
  }
  const lower = remediation.toLowerCase();
  return DEFERRAL_PHRASES.some(phrase => lower.includes(phrase));
}

function _llmFindings(findings) {
  return findings.filter(finding => finding.source === 'llm');
}

function _termIris(model) {
  return new Set(model.vocab.terms.map(term => term.iri));
}
