/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {evaluate} from '../../lib/eval/runEval.js';
import {expect} from 'chai';

const NS = 'https://example.org/v#';

// a minimal resolved model with one real term, matching loadModel's shape
function model() {
  return {
    vocab: {
      namespace: NS,
      terms: [{id: 'knows', iri: `${NS}knows`, kind: 'property',
        domain: [`${NS}Person`], range: [`${NS}Person`]}]
    },
    context: {mappings: []}
  };
}

// a case as the shell hands it to evaluate: manifest fields + loaded model
function evalCase(overrides = {}) {
  return {
    name: 'broken-orphan', model: model(), expectedRuleIds: ['pair/orphan'],
    ...overrides
  };
}

// evaluate is the functional core of the eval gate (PLAN-eval-runner). It
// takes loaded cases plus the findings produced for each and returns the
// metrics report: deterministic recall plus the three LLM-output checks.
// Pure, no IO.
describe('eval: evaluate (eval-gate runner core)', () => {
  describe('deterministic recall', () => {
    it('is 1.0 when every seeded defect is flagged by its rule', () => {
      const cases = [evalCase()];
      const findingsByCase = {'broken-orphan': [{id: 'pair/orphan',
        severity: 'error', source: 'deterministic', artifact: 'context',
        message: 'x'}]};
      const report = evaluate({cases, findingsByCase});
      expect(report.recall.seeded).to.equal(1);
      expect(report.recall.caught).to.equal(1);
      expect(report.recall.rate).to.equal(1);
    });

    it('drops below 1.0 when a seeded defect is missed', () => {
      const cases = [evalCase()];
      // the expected rule id is absent from the produced findings
      const findingsByCase = {'broken-orphan': []};
      const report = evaluate({cases, findingsByCase});
      expect(report.recall.seeded).to.equal(1);
      expect(report.recall.caught).to.equal(0);
      expect(report.recall.rate).to.equal(0);
    });

    it('ignores clean cases (no expected rules) in the recall denominator',
      () => {
        const cases = [evalCase({name: 'good', expectedRuleIds: []})];
        const report = evaluate({cases, findingsByCase: {good: []}});
        expect(report.recall.seeded).to.equal(0);
        // rate is defined as 1.0 when there is nothing to catch
        expect(report.recall.rate).to.equal(1);
      });
  });

  describe('hard gate', () => {
    it('passes when recall is 1.0 and no LLM findings violate a check', () => {
      const cases = [evalCase()];
      const findingsByCase = {'broken-orphan': [{id: 'pair/orphan',
        severity: 'error', source: 'deterministic', artifact: 'context',
        message: 'x'}]};
      const report = evaluate({cases, findingsByCase});
      expect(report.hardGatePassed).to.equal(true);
    });

    it('fails when a seeded defect is missed (recall < 1.0)', () => {
      const report = evaluate(
        {cases: [evalCase()], findingsByCase: {'broken-orphan': []}});
      expect(report.hardGatePassed).to.equal(false);
    });

    it('fails when an LLM finding cites a hallucinated term', () => {
      const cases = [evalCase({expectedRuleIds: []})];
      const findingsByCase = {'broken-orphan': [{id: 'llm/naming',
        severity: 'warning', source: 'llm', artifact: 'vocabulary',
        term: `${NS}ghost`, message: 'x',
        remediation: 'Rename to a noun.'}]};
      const report = evaluate({cases, findingsByCase});
      expect(report.citation.valid).to.equal(false);
      expect(report.hardGatePassed).to.equal(false);
    });

    it('fails when an LLM finding defers instead of recommending', () => {
      const cases = [evalCase({expectedRuleIds: []})];
      const findingsByCase = {'broken-orphan': [{id: 'llm/naming',
        severity: 'warning', source: 'llm', artifact: 'vocabulary',
        term: `${NS}knows`, message: 'x',
        remediation: 'It depends; needs expert input.'}]};
      const report = evaluate({cases, findingsByCase});
      expect(report.deferral.rate).to.be.above(0);
      expect(report.hardGatePassed).to.equal(false);
    });
  });

  describe('the three checks are computed and reported', () => {
    it('reports citation, deferral, and faithfulness verdicts', () => {
      const cases = [evalCase({expectedRuleIds: []})];
      const report = evaluate({cases, findingsByCase: {'broken-orphan': []}});
      expect(report.citation).to.have.property('valid');
      expect(report.deferral).to.have.property('rate');
      expect(report.faithfulness).to.have.property('faithful');
    });
  });
});
