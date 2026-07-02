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

  describe('clean-labeled cases must be finding-free', () => {
    // a case with no expected rules (the `good` baseline, the known-good real
    // anchors) is a false-positive guard: any finding on it fails the gate,
    // which recall alone cannot catch (a clean case adds nothing to recall).
    it('fails the gate when a clean case produces any finding', () => {
      const cases = [evalCase({name: 'anchor-x', expectedRuleIds: []})];
      const findingsByCase = {'anchor-x': [{id: 'ctx/unprotected',
        severity: 'warning', source: 'deterministic', artifact: 'context',
        message: 'x'}]};
      const report = evaluate({cases, findingsByCase});
      expect(report.cleanliness.clean).to.equal(false);
      expect(report.cleanliness.cleanViolations[0].case).to.equal('anchor-x');
      expect(report.hardGatePassed).to.equal(false);
    });

    it('passes the gate when every clean case is finding-free', () => {
      const cases = [evalCase({name: 'anchor-x', expectedRuleIds: []})];
      const report = evaluate({cases, findingsByCase: {'anchor-x': []}});
      expect(report.cleanliness.clean).to.equal(true);
      expect(report.hardGatePassed).to.equal(true);
    });

    it('does not apply the clean rule to seeded-defect cases', () => {
      // a defect case legitimately produces its expected finding; that is not
      // a cleanliness violation
      const cases = [evalCase()];
      const findingsByCase = {'broken-orphan': [{id: 'pair/orphan',
        severity: 'error', source: 'deterministic', artifact: 'context',
        message: 'x'}]};
      const report = evaluate({cases, findingsByCase});
      expect(report.cleanliness.clean).to.equal(true);
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

  // checks must validate a finding against the model of the case that PRODUCED
  // it, not a pool of all cases' terms. Otherwise a finding in case B citing a
  // term that only exists in case A slips through. Dormant for deterministic
  // runRules (a rule only cites its own case), but a real hole once Phase 2 LLM
  // findings span the golden set.
  describe('checks are per-case, not pooled across cases', () => {
    // two cases whose models define disjoint terms
    function caseWithTerm(name, localName) {
      return {
        name, expectedRuleIds: [],
        model: {
          vocab: {namespace: NS, terms: [{
            id: localName, iri: `${NS}${localName}`, kind: 'property',
            domain: [`${NS}Thing`], range: [`${NS}Thing`]
          }]},
          context: {mappings: []}
        }
      };
    }

    it('flags an LLM finding citing a term from a different case', () => {
      const cases = [caseWithTerm('caseA', 'alpha'),
        caseWithTerm('caseB', 'beta')];
      // caseB's finding cites caseA's term — a cross-case hallucination
      const findingsByCase = {
        caseA: [],
        caseB: [{id: 'llm/naming', severity: 'warning', source: 'llm',
          artifact: 'vocabulary', term: `${NS}alpha`, message: 'x',
          remediation: 'Rename to a noun.'}]
      };
      const report = evaluate({cases, findingsByCase});
      expect(report.citation.valid).to.equal(false);
      expect(report.hardGatePassed).to.equal(false);
    });

    it('passes when each finding cites a term from its own case', () => {
      const cases = [caseWithTerm('caseA', 'alpha'),
        caseWithTerm('caseB', 'beta')];
      const findingsByCase = {
        caseA: [{id: 'llm/naming', severity: 'warning', source: 'llm',
          artifact: 'vocabulary', term: `${NS}alpha`, message: 'x',
          remediation: 'Rename to a noun.'}],
        caseB: [{id: 'llm/naming', severity: 'warning', source: 'llm',
          artifact: 'vocabulary', term: `${NS}beta`, message: 'x',
          remediation: 'Rename to a noun.'}]
      };
      const report = evaluate({cases, findingsByCase});
      expect(report.citation.valid).to.equal(true);
    });
  });
});
