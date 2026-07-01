/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {resolveContext} from '../../lib/shell/resolveContext.js';

const REAL = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'real');

async function readJson(name) {
  return JSON.parse(await readFile(join(REAL, name), 'utf8'));
}

describe('shell: container and explicit-@id terms', () => {
  it('resolves a @container: @graph term via its explicit @id', async () => {
    const {mappings} = await resolveContext({
      '@context': {
        sec: 'https://w3id.org/security#',
        proof: {'@id': 'sec:proof', '@type': '@id', '@container': '@graph'}
      }
    });
    const proof = mappings.find(m => m.term === 'proof');
    expect(proof.iri).to.equal('https://w3id.org/security#proof');
  });

  it('resolves a term with @container: @set', async () => {
    const {mappings} = await resolveContext({
      '@context': {
        ex: 'https://example.org/v#',
        tags: {'@id': 'ex:tags', '@container': '@set'}
      }
    });
    const tags = mappings.find(m => m.term === 'tags');
    expect(tags.iri).to.equal('https://example.org/v#tags');
    // the mapping now also carries the @container for the collision rule
    expect(tags.container).to.deep.equal(['@set']);
  });

  it('still resolves a plain CURIE term (no explicit @id)', async () => {
    const {mappings} = await resolveContext({
      '@context': {ex: 'https://example.org/v#', name: 'ex:name'}
    });
    expect(mappings).to.deep.include(
      {term: 'name', iri: 'https://example.org/v#name'});
  });

  it('still reports a genuinely unresolvable term as null', async () => {
    const {mappings} = await resolveContext({
      '@context': {ex: 'https://example.org/v#', bad: 'noPrefixHere'}
    });
    expect(mappings).to.deep.include({term: 'bad', iri: null});
  });

  describe('real W3C contexts (known-good, must not error on resolution)',
    () => {
      it('credentials-v2 context: proof/verifiableCredential resolve',
        async () => {
          const context = await readJson('credentials-v2.context.jsonld');
          const {mappings} = await resolveContext(context);
          const byTerm = Object.fromEntries(mappings.map(m => [m.term, m.iri]));
          // these are @graph-container terms with explicit @ids
          expect(byTerm.proof, 'proof').to.be.a('string');
          expect(byTerm.verifiableCredential, 'verifiableCredential')
            .to.be.a('string');
        });

      it('data-integrity-v2 context: proof resolves', async () => {
        const context = await readJson('data-integrity-v2.context.jsonld');
        const {mappings} = await resolveContext(context);
        const proof = mappings.find(m => m.term === 'proof');
        expect(proof.iri).to.equal('https://w3id.org/security#proof');
      });
    });
});
