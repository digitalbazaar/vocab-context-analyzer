/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {citationValidity, deferralRate, englishFaithfulness} from './checks.js';

/**
 * The functional core of the eval gate (PLAN-eval-runner, design doc section
 * 3). Given the loaded golden-set cases and the findings produced for each,
 * compute the gate's metrics: deterministic recall over seeded defects plus the
 * three deterministic checks over LLM output (citation validity, deferral rate,
 * English faithfulness). Pure — no IO, no LLM. The shell loads the cases, runs
 * the rules/LLM, and hands the results here.
 *
 * The hard gate (design doc section 1) is the `==` floor: recall must be 1.0,
 * citations must all be valid, and the deferral rate must be 0. Faithfulness is
 * only meaningful once renderings exist, so it gates only when renderings are
 * supplied. These pass trivially while no LLM findings exist, which keeps the
 * gate wired and ready ahead of the Phase 2 LLM layer.
 *
 * @param {object} input - The evaluation input.
 * @param {object[]} input.cases - Loaded cases: `{name, model, expectedRuleIds,
 *   [renderings]}`.
 * @param {object} input.findingsByCase - Map of case name to the `Finding[]`
 *   produced for that case (deterministic now; LLM findings later).
 *
 * @returns {object} The metrics report: `{recall, citation, deferral,
 *   faithfulness, hardGatePassed}`.
 */
export function evaluate({cases, findingsByCase}) {
  let seeded = 0;
  let caught = 0;
  const hallucinated = [];
  const deferred = [];
  const unfaithful = [];
  const allDeferralFindings = [];

  // each check runs against the model of the case that PRODUCED the finding,
  // so a finding citing a term from a different case is correctly flagged.
  // Verdicts aggregate across cases rather than pooling every case's terms.
  for(const {name, model, expectedRuleIds = [], renderings = []} of cases) {
    const findings = findingsByCase[name] ?? [];

    const ids = new Set(findings.map(finding => finding.id));
    for(const expectedId of expectedRuleIds) {
      seeded++;
      if(ids.has(expectedId)) {
        caught++;
      }
    }

    hallucinated.push(...citationValidity(findings, model).hallucinated);
    unfaithful.push(...englishFaithfulness(renderings, model).unfaithful);
    allDeferralFindings.push(...findings);
    deferred.push(...deferralRate(findings).deferred);
  }

  // recall is 1.0 by definition when there is nothing seeded to catch
  const recall = {seeded, caught, rate: seeded === 0 ? 1 : caught / seeded};
  const citation = {valid: hallucinated.length === 0, hallucinated};
  const faithfulness = {faithful: unfaithful.length === 0, unfaithful};
  // deferral rate is over all LLM findings across the golden set
  const llmCount = allDeferralFindings.filter(f => f.source === 'llm').length;
  const deferral = {rate: llmCount === 0 ? 0 : deferred.length / llmCount,
    deferred};

  const hardGatePassed = recall.rate === 1 && citation.valid &&
    deferral.rate === 0 && faithfulness.faithful;

  return {recall, citation, deferral, faithfulness, hardGatePassed};
}
