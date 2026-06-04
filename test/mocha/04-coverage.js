/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {coverage} from '../../lib/rules/coverage.js';
import {expect} from 'chai';

describe('rule: pair/coverage', () => {
  it('produces no finding when every vocab term is in the context', () => {
    const model = {
      vocab: {terms: [
        {id: 'name', iri: 'https://example.org/v#name'},
        {id: 'age', iri: 'https://example.org/v#age'}
      ]},
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'},
        {term: 'age', iri: 'https://example.org/v#age'}
      ]}
    };
    expect(coverage(model)).to.deep.equal([]);
  });

  it('flags a vocab term missing from the context as a warning', () => {
    const model = {
      vocab: {terms: [
        {id: 'name', iri: 'https://example.org/v#name'},
        {id: 'age', iri: 'https://example.org/v#age'}
      ]},
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'}
      ]}
    };
    const findings = coverage(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'pair/coverage',
      severity: 'warning',
      artifact: 'pairing',
      term: 'https://example.org/v#age'
    });
  });

  it('matches by IRI, not by local name', () => {
    // context maps the term under a different alias but the same IRI
    const model = {
      vocab: {terms: [{id: 'name', iri: 'https://example.org/v#name'}]},
      context: {mappings: [
        {term: 'fullName', iri: 'https://example.org/v#name'}
      ]}
    };
    expect(coverage(model)).to.deep.equal([]);
  });
});
