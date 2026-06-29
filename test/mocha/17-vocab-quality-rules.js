/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {deprecatedTerm} from '../../lib/rules/deprecatedTerm.js';
import {expect} from 'chai';
import {protectedContext} from '../../lib/rules/protectedContext.js';
import {stableIri} from '../../lib/rules/stableIri.js';
import {unsafeVocab} from '../../lib/rules/unsafeVocab.js';

const NS = 'https://example.org/v#';

describe('rule: vocab/unstable-iri', () => {
  it('produces no finding for stable term IRIs', () => {
    const model = {
      vocab: {terms: [{id: 'name', iri: `${NS}name`, kind: 'property'}]},
      context: {mappings: []}
    };
    expect(stableIri(model)).to.deep.equal([]);
  });

  it('flags a version number embedded in the term IRI', () => {
    const model = {
      vocab: {terms: [
        {id: 'name', iri: 'https://example.org/v2#name', kind: 'property'}
      ]},
      context: {mappings: []}
    };
    const findings = stableIri(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'vocab/unstable-iri', severity: 'warning', artifact: 'vocabulary'
    });
  });

  it('flags a version segment like /1.0/ in the IRI path', () => {
    const model = {
      vocab: {terms: [
        {id: 'x', iri: 'https://example.org/vocab/1.0/x', kind: 'class'}
      ]},
      context: {mappings: []}
    };
    expect(stableIri(model)).to.have.lengthOf(1);
  });
});

describe('rule: ctx/unprotected', () => {
  it('produces no finding when the context is @protected', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {'@protected': true, ex: `${NS}`}}
    };
    expect(protectedContext(model)).to.deep.equal([]);
  });

  it('flags a context that is not @protected', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {ex: `${NS}`, name: 'ex:name'}}
    };
    const findings = protectedContext(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'ctx/unprotected', severity: 'warning', artifact: 'context'
    });
  });

  it('does not flag when raw context is unavailable', () => {
    const model = {vocab: {terms: []}, context: {mappings: []}};
    expect(protectedContext(model)).to.deep.equal([]);
  });
});

describe('rule: ctx/unsafe-vocab', () => {
  it('produces no finding when @vocab is an absolute IRI', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {'@vocab': `${NS}`, name: 'ex:name'}}
    };
    expect(unsafeVocab(model)).to.deep.equal([]);
  });

  it('produces no finding when no @vocab is declared', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {ex: `${NS}`, name: 'ex:name'}}
    };
    expect(unsafeVocab(model)).to.deep.equal([]);
  });

  it('flags a blank-node @vocab (breaks canonicalization)', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {'@vocab': '_:'}}
    };
    const findings = unsafeVocab(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'ctx/unsafe-vocab', severity: 'error', artifact: 'context'
    });
  });

  it('flags a relative @vocab (resolves against document base)', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {'@vocab': 'terms/'}}
    };
    const findings = unsafeVocab(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0].id).to.equal('ctx/unsafe-vocab');
  });

  it('flags an empty-string @vocab', () => {
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {'@vocab': ''}}
    };
    expect(unsafeVocab(model)).to.have.lengthOf(1);
  });

  it('does not flag per-term "@type": "@vocab" coercions', () => {
    // the top-level @vocab key is the canonicalization hazard; a term-level
    // "@type": "@vocab" coercion is unrelated and must not be flagged
    const model = {
      vocab: {terms: []},
      context: {mappings: [], raw: {
        ex: `${NS}`, action: {'@id': 'ex:action', '@type': '@vocab'}
      }}
    };
    expect(unsafeVocab(model)).to.deep.equal([]);
  });

  it('does not flag when raw context is unavailable', () => {
    const model = {vocab: {terms: []}, context: {mappings: []}};
    expect(unsafeVocab(model)).to.deep.equal([]);
  });
});

describe('rule: vocab/deprecated-mapped', () => {
  it('produces no finding when deprecated terms are absent', () => {
    const model = {
      vocab: {terms: [{id: 'name', iri: `${NS}name`, kind: 'property'}]},
      context: {mappings: [{term: 'name', iri: `${NS}name`}]}
    };
    expect(deprecatedTerm(model)).to.deep.equal([]);
  });

  it('flags a deprecated term still mapped in the context', () => {
    const model = {
      vocab: {terms: [
        {id: 'old', iri: `${NS}old`, kind: 'property', deprecated: true}
      ]},
      context: {mappings: [{term: 'old', iri: `${NS}old`}]}
    };
    const findings = deprecatedTerm(model);
    expect(findings).to.have.lengthOf(1);
    expect(findings[0]).to.include({
      id: 'vocab/deprecated-mapped', severity: 'warning',
      artifact: 'pairing', term: `${NS}old`
    });
  });

  it('does not flag a deprecated term that is not in the context', () => {
    const model = {
      vocab: {terms: [
        {id: 'old', iri: `${NS}old`, kind: 'property', deprecated: true}
      ]},
      context: {mappings: []}
    };
    expect(deprecatedTerm(model)).to.deep.equal([]);
  });
});
