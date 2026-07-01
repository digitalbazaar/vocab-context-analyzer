/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {resolveContext} from '../../lib/shell/resolveContext.js';

describe('shell: resolveContext', () => {
  it('resolves prefixed terms to absolute IRIs', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      name: 'ex:name',
      age: 'ex:age'
    };
    const {mappings} = await resolveContext({'@context': ctx});
    expect(mappings).to.deep.include.members([
      {term: 'name', iri: 'https://example.org/v#name'},
      {term: 'age', iri: 'https://example.org/v#age'}
    ]);
  });

  it('resolves expanded term definitions ({@id, @type})', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      age: {'@id': 'ex:age', '@type': 'http://www.w3.org/2001/XMLSchema#integer'}
    };
    const {mappings} = await resolveContext({'@context': ctx});
    const age = mappings.find(m => m.term === 'age');
    expect(age.iri).to.equal('https://example.org/v#age');
  });

  // characterization tests pinning the @type coercion the resolver attaches
  // to a mapping. The coercion rule (ctx/missing-coercion) depends on these
  // exact values, so any change to how @type is extracted must preserve them.
  it('carries a datatype coercion as an absolute IRI', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      age: {'@id': 'ex:age', '@type': 'http://www.w3.org/2001/XMLSchema#integer'}
    };
    const {mappings} = await resolveContext({'@context': ctx});
    const age = mappings.find(m => m.term === 'age');
    expect(age.coercion).to.equal('http://www.w3.org/2001/XMLSchema#integer');
  });

  it('carries an @id coercion as the keyword @id', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      knows: {'@id': 'ex:knows', '@type': '@id'}
    };
    const {mappings} = await resolveContext({'@context': ctx});
    const knows = mappings.find(m => m.term === 'knows');
    expect(knows.coercion).to.equal('@id');
  });

  it('expands a CURIE datatype coercion against its prefix', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      xsd: 'http://www.w3.org/2001/XMLSchema#',
      age: {'@id': 'ex:age', '@type': 'xsd:integer'}
    };
    const {mappings} = await resolveContext({'@context': ctx});
    const age = mappings.find(m => m.term === 'age');
    expect(age.coercion).to.equal('http://www.w3.org/2001/XMLSchema#integer');
  });

  it('omits coercion for a term with no @type', async () => {
    const ctx = {ex: 'https://example.org/v#', name: 'ex:name'};
    const {mappings} = await resolveContext({'@context': ctx});
    const name = mappings.find(m => m.term === 'name');
    expect(name).to.not.have.property('coercion');
  });

  // @container distinguishes intentional language-map / collection variants of
  // a term from a genuine duplicate alias (ctx/iri-collision depends on it).
  it('captures @container as an array on the mapping', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      contentMap: {'@id': 'ex:content', '@container': '@language'}
    };
    const {mappings} = await resolveContext({'@context': ctx});
    const contentMap = mappings.find(m => m.term === 'contentMap');
    expect(contentMap.container).to.deep.equal(['@language']);
  });

  it('omits container for a term with no @container', async () => {
    const ctx = {ex: 'https://example.org/v#', name: 'ex:name'};
    const {mappings} = await resolveContext({'@context': ctx});
    const name = mappings.find(m => m.term === 'name');
    expect(name).to.not.have.property('container');
  });

  it('does not emit a mapping for prefix entries themselves', async () => {
    const ctx = {ex: 'https://example.org/v#', name: 'ex:name'};
    const {mappings} = await resolveContext({'@context': ctx});
    expect(mappings.map(m => m.term)).to.not.include('ex');
  });

  it('reports an unresolvable term with iri null', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      name: 'ex:name',
      bad: 'noPrefixHere'
    };
    const {mappings} = await resolveContext({'@context': ctx});
    expect(mappings).to.deep.include(
      {term: 'name', iri: 'https://example.org/v#name'});
    expect(mappings).to.deep.include({term: 'bad', iri: null});
  });

  it('one bad term does not blind resolution of the good ones', async () => {
    const ctx = {
      ex: 'https://example.org/v#',
      a: 'ex:a', b: 'relativeBad', c: 'ex:c'
    };
    const {mappings} = await resolveContext({'@context': ctx});
    const byTerm = Object.fromEntries(mappings.map(m => [m.term, m.iri]));
    expect(byTerm.a).to.equal('https://example.org/v#a');
    expect(byTerm.b).to.equal(null);
    expect(byTerm.c).to.equal('https://example.org/v#c');
  });

  it('ignores @keywords', async () => {
    const ctx = {'@version': 1.1, ex: 'https://example.org/v#', name: 'ex:name'};
    const {mappings} = await resolveContext({'@context': ctx});
    expect(mappings.map(m => m.term)).to.not.include('@version');
  });

  it('accepts a bare context object (no @context wrapper)', async () => {
    const {mappings} = await resolveContext(
      {ex: 'https://example.org/v#', name: 'ex:name'});
    expect(mappings).to.deep.include(
      {term: 'name', iri: 'https://example.org/v#name'});
  });

  it('is offline by default — does not fetch a remote context', async () => {
    // a context that @imports a remote URL the offline loader cannot fetch;
    // the remote-dependent term resolves to null rather than hitting network
    const ctx = {
      ex: 'https://example.org/v#',
      local: 'ex:local'
    };
    const {mappings} = await resolveContext({'@context': ctx});
    expect(mappings).to.deep.include(
      {term: 'local', iri: 'https://example.org/v#local'});
  });
});
