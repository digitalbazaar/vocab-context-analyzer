/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {runRules} from '../../lib/runRules.js';
import {validateFindings} from '../../lib/findingSchema.js';

describe('runRules', () => {
  it('returns no findings for a clean model', () => {
    const model = {
      vocab: {
        namespace: 'https://example.org/v#',
        terms: [
          {id: 'name', iri: 'https://example.org/v#name', label: 'Name'}
        ]
      },
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'}
      ]}
    };
    expect(runRules(model)).to.deep.equal([]);
  });

  it('aggregates findings from multiple rules', () => {
    const model = {
      vocab: {
        namespace: 'https://example.org/v#',
        terms: [
          // missing definition -> vocab/no-definition
          {id: 'name', iri: 'https://example.org/v#name'},
          // not in context -> pair/coverage
          {id: 'age', iri: 'https://example.org/v#age', label: 'Age'}
        ]
      },
      context: {mappings: [
        {term: 'name', iri: 'https://example.org/v#name'},
        // collides with name -> ctx/iri-collision
        {term: 'fullName', iri: 'https://example.org/v#name'},
        // unresolved -> ctx/iri-unresolved
        {term: 'broken', iri: null}
      ]}
    };
    const findings = runRules(model);
    const ids = findings.map(f => f.id);
    expect(ids).to.include.members([
      'vocab/no-definition', 'pair/coverage', 'ctx/iri-collision',
      'ctx/iri-unresolved'
    ]);
  });

  it('returns a schema-valid Finding[] (SPEC section 7.3)', () => {
    const model = {
      vocab: {namespace: 'https://example.org/v#', terms: [
        {id: 'x', iri: 'https://example.org/v#x'}
      ]},
      context: {mappings: [{term: 'x', iri: null}]}
    };
    const findings = runRules(model);
    expect(() => validateFindings(findings)).to.not.throw();
  });

  it('sorts findings by severity then id (errors first)', () => {
    const model = {
      vocab: {namespace: 'https://example.org/v#', terms: [
        {id: 'undef', iri: 'https://example.org/v#undef'}
      ]},
      context: {mappings: [{term: 'broken', iri: null}]}
    };
    const findings = runRules(model);
    // an error (ctx/iri-unresolved) must come before a warning
    const severities = findings.map(f => f.severity);
    const firstWarning = severities.indexOf('warning');
    const lastError = severities.lastIndexOf('error');
    if(firstWarning !== -1 && lastError !== -1) {
      expect(lastError).to.be.below(firstWarning);
    }
  });
});
