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
    expect(mappings).to.deep.include(
      {term: 'age', iri: 'https://example.org/v#age'});
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
