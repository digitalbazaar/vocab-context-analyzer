/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {termHasDefinition} from '../../lib/rules/termHasDefinition.js';

describe('rule: vocab/no-definition', () => {
  it('produces no finding when every term has a label or comment', () => {
    const model = {
      vocab: {terms: [
        {id: 'name', iri: 'https://example.org/v#name', label: 'Name'},
        {id: 'age', iri: 'https://example.org/v#age', comment: 'The age.'}
      ]},
      context: {mappings: []}
    };
    expect(termHasDefinition(model)).to.deep.equal([]);
  });

  it('flags a term with neither label nor comment as a warning', () => {
    const model = {
      vocab: {terms: [
        {id: 'name', iri: 'https://example.org/v#name', label: 'Name'},
        {id: 'mystery', iri: 'https://example.org/v#mystery'}
      ]},
      context: {mappings: []}
    };
    const findings = termHasDefinition(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'vocab/no-definition',
      severity: 'warning',
      artifact: 'vocabulary',
      term: 'https://example.org/v#mystery'
    });
  });

  it('treats an empty-string label/comment as missing', () => {
    const model = {
      vocab: {terms: [
        {id: 'x', iri: 'https://example.org/v#x', label: '', comment: ''}
      ]},
      context: {mappings: []}
    };
    expect(termHasDefinition(model)).to.have.lengthOf(1);
  });
});
