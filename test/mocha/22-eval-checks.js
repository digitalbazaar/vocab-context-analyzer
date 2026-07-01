/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {
  citationValidity, deferralRate, englishFaithfulness
} from '../../lib/eval/checks.js';
import {expect} from 'chai';

const NS = 'https://example.org/v#';

// a model with two real terms, the shape loadModel produces
function model() {
  return {
    vocab: {
      namespace: NS,
      terms: [
        {id: 'Person', iri: `${NS}Person`, kind: 'class'},
        {id: 'knows', iri: `${NS}knows`, kind: 'property',
          domain: [`${NS}Person`], range: [`${NS}Person`]}
      ]
    },
    context: {mappings: []}
  };
}

// a well-formed LLM finding: cites a real term, carries an actionable fix
function llmFinding(overrides = {}) {
  return {
    id: 'llm/naming',
    severity: 'warning',
    source: 'llm',
    artifact: 'vocabulary',
    term: `${NS}knows`,
    message: 'The predicate name reads as a verb phrase.',
    remediation: 'Rename to a noun form consistent with sibling terms.',
    ...overrides
  };
}

describe('eval: citation validity', () => {
  it('passes when every LLM finding cites a real term', () => {
    const result = citationValidity([llmFinding()], model());
    expect(result.valid).to.equal(true);
    expect(result.hallucinated).to.deep.equal([]);
  });

  it('flags an LLM finding whose term is not in the model', () => {
    const finding = llmFinding({term: `${NS}ghost`});
    const result = citationValidity([finding], model());
    expect(result.valid).to.equal(false);
    expect(result.hallucinated).to.have.lengthOf(1);
    expect(result.hallucinated[0].term).to.equal(`${NS}ghost`);
  });

  it('ignores deterministic findings (only LLM findings are checked)', () => {
    const deterministic = llmFinding({source: 'deterministic', term: `${NS}x`});
    const result = citationValidity([deterministic], model());
    expect(result.valid).to.equal(true);
  });

  it('flags an LLM finding with no term at all', () => {
    const finding = llmFinding();
    delete finding.term;
    const result = citationValidity([finding], model());
    expect(result.valid).to.equal(false);
  });
});

describe('eval: deferral rate', () => {
  it('is zero when every LLM finding has an actionable remediation', () => {
    const result = deferralRate([llmFinding(), llmFinding()]);
    expect(result.rate).to.equal(0);
    expect(result.deferred).to.deep.equal([]);
  });

  it('counts a finding with no remediation as a deferral', () => {
    const finding = llmFinding();
    delete finding.remediation;
    const result = deferralRate([finding]);
    expect(result.rate).to.equal(1);
    expect(result.deferred).to.have.lengthOf(1);
  });

  it('counts a non-actionable remediation phrase as a deferral', () => {
    const finding = llmFinding({
      remediation: 'It depends; this needs expert input.'
    });
    const result = deferralRate([finding]);
    expect(result.rate).to.equal(1);
  });

  it('counts an explicit defer flag as a deferral', () => {
    const result = deferralRate([llmFinding({defer: true})]);
    expect(result.rate).to.equal(1);
  });

  it('ignores deterministic findings', () => {
    const det = llmFinding({source: 'deterministic'});
    delete det.remediation;
    const result = deferralRate([det]);
    expect(result.rate).to.equal(0);
  });

  it('reports rate 0 over an empty finding set', () => {
    expect(deferralRate([]).rate).to.equal(0);
  });
});

describe('eval: english faithfulness', () => {
  // a rendering states a triple; faithful iff it matches the model's term
  function rendering(overrides = {}) {
    return {
      subject: `${NS}knows`,
      property: 'rdfs:domain',
      object: `${NS}Person`,
      text: 'The property "knows" has domain Person.',
      ...overrides
    };
  }

  it('passes when the rendered triple matches the model', () => {
    const result = englishFaithfulness([rendering()], model());
    expect(result.faithful).to.equal(true);
    expect(result.unfaithful).to.deep.equal([]);
  });

  it('flags a rendering whose subject is not a real term', () => {
    const result = englishFaithfulness(
      [rendering({subject: `${NS}ghost`})], model());
    expect(result.faithful).to.equal(false);
    expect(result.unfaithful).to.have.lengthOf(1);
  });

  it('flags a rendering whose domain disagrees with the model', () => {
    const result = englishFaithfulness(
      [rendering({object: `${NS}Animal`})], model());
    expect(result.faithful).to.equal(false);
  });

  it('passes over an empty rendering set', () => {
    expect(englishFaithfulness([], model()).faithful).to.equal(true);
  });
});
