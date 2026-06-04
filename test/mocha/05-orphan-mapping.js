/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {orphanMapping} from '../../lib/rules/orphanMapping.js';

describe('rule: pair/orphan', () => {
  it('produces no finding when every mapping has a vocab term', () => {
    const model = {
      vocab: {
        namespace: 'https://example.org/v#',
        terms: [{id: 'name', iri: 'https://example.org/v#name'}]
      },
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'}
      ]}
    };
    expect(orphanMapping(model)).to.deep.equal([]);
  });

  it('emits nothing when the vocab namespace is unknown', () => {
    const model = {
      vocab: {terms: [{id: 'name', iri: 'https://example.org/v#name'}]},
      context: {mappings: [
        {term: 'ghost', iri: 'https://example.org/v#ghost'}
      ]}
    };
    expect(orphanMapping(model)).to.deep.equal([]);
  });

  it('flags a context mapping to an IRI with no vocab term', () => {
    const model = {
      vocab: {
        namespace: 'https://example.org/v#',
        terms: [{id: 'name', iri: 'https://example.org/v#name'}]
      },
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'},
        {term: 'ghost', iri: 'https://example.org/v#ghost'}
      ]}
    };
    const findings = orphanMapping(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'pair/orphan',
      severity: 'error',
      artifact: 'pairing',
      term: 'ghost'
    });
  });

  it('does not flag mappings to external IRIs outside the vocab', () => {
    // a mapping to a well-known external term is not an orphan; only mappings
    // into the vocab namespace that miss a definition are orphans
    const model = {
      vocab: {
        namespace: 'https://example.org/v#',
        terms: [{id: 'name', iri: 'https://example.org/v#name'}]
      },
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'},
        {term: 'type', iri: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'}
      ]}
    };
    expect(orphanMapping(model)).to.deep.equal([]);
  });

  it('ignores unresolved (null) IRIs', () => {
    const model = {
      vocab: {namespace: 'https://example.org/v#', terms: []},
      context: {mappings: [{term: 'x', iri: null}]}
    };
    expect(orphanMapping(model)).to.deep.equal([]);
  });
});
