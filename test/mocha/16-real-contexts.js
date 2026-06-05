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

// real, published W3C and Digital Bazaar contexts captured from the wild. These
// exercise the patterns synthetic fixtures miss: keyword aliases, nested scoped
// contexts, and @container-typed term definitions. Every term must resolve to
// an absolute IRI — a regression here means the resolver has broken on a shape
// that exists in production contexts.
const CONTEXTS = [
  'activitystreams.context.jsonld',
  'citizenship-v1.context.jsonld',
  'credentials-v2.context.jsonld',
  'data-integrity-v2.context.jsonld',
  'did.context.jsonld',
  'ed25519-2020.context.jsonld',
  'odrl.context.jsonld',
  'statuslist-2021.context.jsonld'
];

async function readJson(name) {
  return JSON.parse(await readFile(join(REAL, name), 'utf8'));
}

describe('shell: real-world contexts resolve cleanly', () => {
  for(const file of CONTEXTS) {
    describe(file, () => {
      let mappings;
      before(async () => {
        ({mappings} = await resolveContext(await readJson(file)));
      });

      it('maps at least one term', () => {
        expect(mappings.length).to.be.above(0);
      });

      it('resolves every term to an absolute IRI (no false unresolved)', () => {
        const unresolved = mappings.filter(m => m.iri === null);
        expect(unresolved.map(m => m.term), 'unresolved terms')
          .to.deep.equal([]);
      });

      it('has no duplicate term mappings', () => {
        const terms = mappings.map(m => m.term);
        expect(terms.length).to.equal(new Set(terms).size);
      });

      it('does not surface JSON-LD keyword aliases as terms', () => {
        const terms = mappings.map(m => m.term);
        expect(terms).to.not.include('id');
        expect(terms).to.not.include('type');
      });
    });
  }
});
