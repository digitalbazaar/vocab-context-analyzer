/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {contextIriResolves} from '../../lib/rules/contextIriResolves.js';
import {expect} from 'chai';

describe('rule: ctx/iri-unresolved', () => {
  it('produces no finding when every mapping has an absolute IRI', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/vocab#name'},
        {term: 'age', iri: 'https://example.org/vocab#age'}
      ]}
    };
    expect(contextIriResolves(model)).to.deep.equal([]);
  });

  it('flags a mapping with a null IRI', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [{term: 'name', iri: null}]}
    };
    const findings = contextIriResolves(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'ctx/iri-unresolved',
      severity: 'error',
      artifact: 'context',
      term: 'name'
    });
  });

  it('flags a mapping with a relative IRI', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [{term: 'name', iri: 'vocab#name'}]}
    };
    const findings = contextIriResolves(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0].term).to.equal('name');
  });

  it('flags each unresolved mapping independently', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [
        {term: 'a', iri: null},
        {term: 'b', iri: 'https://example.org/v#b'},
        {term: 'c', iri: 'relative'}
      ]}
    };
    const findings = contextIriResolves(model);
    expect(findings.map(f => f.term)).to.deep.equal(['a', 'c']);
  });
});
