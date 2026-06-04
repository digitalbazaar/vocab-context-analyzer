/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {iriCollision} from '../../lib/rules/iriCollision.js';

describe('rule: ctx/iri-collision', () => {
  it('produces no finding when all IRIs are distinct', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'},
        {term: 'age', iri: 'https://example.org/v#age'}
      ]}
    };
    expect(iriCollision(model)).to.deep.equal([]);
  });

  it('flags two distinct terms mapping to the same IRI', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'},
        {term: 'fullName', iri: 'https://example.org/v#name'}
      ]}
    };
    const findings = iriCollision(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'ctx/iri-collision',
      severity: 'error',
      artifact: 'context'
    });
    expect(findings[0].message).to.contain('name');
    expect(findings[0].message).to.contain('fullName');
  });

  it('ignores unresolved (null) IRIs — those are another rule', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [
        {term: 'a', iri: null},
        {term: 'b', iri: null}
      ]}
    };
    expect(iriCollision(model)).to.deep.equal([]);
  });

  it('reports one finding per colliding IRI group', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [
        {term: 'a', iri: 'https://example.org/v#x'},
        {term: 'b', iri: 'https://example.org/v#x'},
        {term: 'c', iri: 'https://example.org/v#y'},
        {term: 'd', iri: 'https://example.org/v#y'}
      ]}
    };
    expect(iriCollision(model)).to.have.lengthOf(2);
  });
});
