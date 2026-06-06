/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {brokenHierarchy} from '../../lib/rules/brokenHierarchy.js';
import {domainRange} from '../../lib/rules/domainRange.js';
import {expect} from 'chai';

const NS = 'https://example.org/v#';

describe('rule: vocab/missing-domain-range', () => {
  it('produces no finding when a property has domain and range', () => {
    const model = {
      vocab: {terms: [{
        id: 'name', iri: `${NS}name`, kind: 'property',
        domain: [`${NS}Person`], range: ['http://www.w3.org/2001/XMLSchema#string']
      }]},
      context: {mappings: []}
    };
    expect(domainRange(model)).to.deep.equal([]);
  });

  it('flags a property missing rdfs:domain', () => {
    const model = {
      vocab: {terms: [{
        id: 'name', iri: `${NS}name`, kind: 'property',
        range: ['http://www.w3.org/2001/XMLSchema#string']
      }]},
      context: {mappings: []}
    };
    const findings = domainRange(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'vocab/missing-domain-range', severity: 'warning',
      artifact: 'vocabulary', term: `${NS}name`
    });
    expect(findings[0].message).to.match(/domain/i);
  });

  it('flags a property missing rdfs:range', () => {
    const model = {
      vocab: {terms: [{
        id: 'name', iri: `${NS}name`, kind: 'property', domain: [`${NS}Person`]
      }]},
      context: {mappings: []}
    };
    const findings = domainRange(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0].message).to.match(/range/i);
  });

  it('does not flag classes (only properties need domain/range)', () => {
    const model = {
      vocab: {terms: [{id: 'Person', iri: `${NS}Person`, kind: 'class'}]},
      context: {mappings: []}
    };
    expect(domainRange(model)).to.deep.equal([]);
  });
});

describe('rule: vocab/broken-hierarchy', () => {
  it('produces no finding when references resolve to defined terms', () => {
    const model = {
      vocab: {
        namespace: NS,
        terms: [
          {id: 'Animal', iri: `${NS}Animal`, kind: 'class'},
          {
            id: 'Dog', iri: `${NS}Dog`, kind: 'class',
            subClassOf: [`${NS}Animal`]
          }
        ]
      },
      context: {mappings: []}
    };
    expect(brokenHierarchy(model)).to.deep.equal([]);
  });

  it('flags a subClassOf reference to an undefined vocab term', () => {
    const model = {
      vocab: {
        namespace: NS,
        terms: [
          {
            id: 'Dog', iri: `${NS}Dog`, kind: 'class',
            subClassOf: [`${NS}Ghost`]
          }
        ]
      },
      context: {mappings: []}
    };
    const findings = brokenHierarchy(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'vocab/broken-hierarchy', severity: 'error', artifact: 'vocabulary'
    });
    expect(findings[0].message).to.contain(`${NS}Ghost`);
  });

  it('flags a broken domain/range reference into the vocab namespace', () => {
    const model = {
      vocab: {
        namespace: NS,
        terms: [
          {id: 'owns', iri: `${NS}owns`, kind: 'property',
            domain: [`${NS}Nonexistent`], range: [`${NS}Thing`]}
        ]
      },
      context: {mappings: []}
    };
    const findings = brokenHierarchy(model);
    // both Nonexistent and Thing are undefined -> 2 findings
    expect(findings).to.have.lengthOf(2);
  });

  it('does not flag references to external (out-of-namespace) terms', () => {
    const model = {
      vocab: {
        namespace: NS,
        terms: [{
          id: 'Dog', iri: `${NS}Dog`, kind: 'class',
          subClassOf: ['http://schema.org/Animal']
        }]
      },
      context: {mappings: []}
    };
    expect(brokenHierarchy(model)).to.deep.equal([]);
  });

  it('emits nothing when the vocab namespace is unknown', () => {
    const model = {
      vocab: {terms: [
        {id: 'Dog', iri: `${NS}Dog`, kind: 'class', subClassOf: [`${NS}Ghost`]}
      ]},
      context: {mappings: []}
    };
    expect(brokenHierarchy(model)).to.deep.equal([]);
  });
});
