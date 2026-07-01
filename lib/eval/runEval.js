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
  const allFindings = [];
  const allRenderings = [];
  const models = [];
  let seeded = 0;
  let caught = 0;

  for(const {name, model, expectedRuleIds = [], renderings = []} of cases) {
    const findings = findingsByCase[name] ?? [];
    allFindings.push(...findings);
    allRenderings.push(...renderings);
    models.push(model);

    const ids = new Set(findings.map(finding => finding.id));
    for(const expectedId of expectedRuleIds) {
      seeded++;
      if(ids.has(expectedId)) {
        caught++;
      }
    }
  }

  // recall is 1.0 by definition when there is nothing seeded to catch
  const recall = {seeded, caught, rate: seeded === 0 ? 1 : caught / seeded};

  // the checks judge LLM findings against the model that produced them; a term
  // is real if it exists in ANY case's model, since findings are pooled here
  const pooledModel = _poolModels(models);
  const citation = citationValidity(allFindings, pooledModel);
  const deferral = deferralRate(allFindings);
  const faithfulness = englishFaithfulness(allRenderings, pooledModel);

  const hardGatePassed = recall.rate === 1 && citation.valid &&
    deferral.rate === 0 && faithfulness.faithful;

  return {recall, citation, deferral, faithfulness, hardGatePassed};
}

// merge every case's terms into one model so a pooled finding's cited term is
// validated against the union of all real terms.
function _poolModels(models) {
  const terms = [];
  for(const model of models) {
    terms.push(...(model?.vocab?.terms ?? []));
  }
  return {vocab: {terms}, context: {mappings: []}};
}
