/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {missingCoercion} from '../../lib/rules/missingCoercion.js';

const NS = 'https://example.org/v#';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';

// a property whose range is a class (object property) and its context mapping
function model({kind = 'property', range, coercion}) {
  const t = {id: 'p', iri: `${NS}p`, kind};
  if(range) {
    t.range = range;
  }
  const mapping = {term: 'p', iri: `${NS}p`};
  if(coercion !== undefined) {
    mapping.coercion = coercion;
  }
  return {vocab: {terms: [t]}, context: {mappings: [mapping]}};
}

describe('rule: ctx/missing-coercion', () => {
  it('no finding: object property coerced to @id', () => {
    const m = model({range: [`${NS}Person`], coercion: '@id'});
    expect(missingCoercion(m)).to.deep.equal([]);
  });

  it('flags an object property with no @id coercion', () => {
    const m = model({range: [`${NS}Person`]});
    const findings = missingCoercion(m);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'ctx/missing-coercion', severity: 'warning', artifact: 'context'
    });
    expect(findings[0].message).to.match(/@id/);
  });

  it('no finding: typed datatype property with matching coercion', () => {
    const m = model({range: [`${XSD}date`], coercion: `${XSD}date`});
    expect(missingCoercion(m)).to.deep.equal([]);
  });

  it('flags a typed datatype property with no coercion', () => {
    const m = model({range: [`${XSD}date`]});
    const findings = missingCoercion(m);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0].message).to.match(/date|coercion/i);
  });

  it('does not flag string-range properties (no coercion needed)', () => {
    // xsd:string is the JSON-LD default; coercion is optional
    const m = model({range: [`${XSD}string`]});
    expect(missingCoercion(m)).to.deep.equal([]);
  });

  it('does not flag language-string ranges (coercion would break i18n)', () => {
    const m = model({range: [`${RDF}langString`]});
    expect(missingCoercion(m)).to.deep.equal([]);
  });

  it('does not flag a property with no declared range', () => {
    const m = model({});
    expect(missingCoercion(m)).to.deep.equal([]);
  });

  it('does not flag classes', () => {
    const m = model({kind: 'class', range: [`${NS}X`]});
    expect(missingCoercion(m)).to.deep.equal([]);
  });

  it('does not flag a vocab term that is not in the context', () => {
    const m = {
      vocab: {terms: [{
        id: 'p', iri: `${NS}p`, kind: 'property', range: [`${NS}Person`]
      }]},
      context: {mappings: []}
    };
    expect(missingCoercion(m)).to.deep.equal([]);
  });
});
