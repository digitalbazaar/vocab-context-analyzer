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

describe('shell: keyword aliases and dedup', () => {
  describe('keyword aliases are not terms', () => {
    it('excludes "id": "@id" and "type": "@type"', async () => {
      const {mappings} = await resolveContext({
        '@context': {
          id: '@id',
          type: '@type',
          ex: 'https://example.org/v#',
          name: 'ex:name'
        }
      });
      const terms = mappings.map(m => m.term);
      expect(terms).to.not.include('id');
      expect(terms).to.not.include('type');
      expect(terms).to.include('name');
    });

    it('excludes other keyword aliases (@json, @container forms)', async () => {
      const {mappings} = await resolveContext({
        '@context': {
          ex: 'https://example.org/v#',
          graph: '@graph',
          name: 'ex:name'
        }
      });
      expect(mappings.map(m => m.term)).to.not.include('graph');
    });
  });

  describe('no duplicate term mappings', () => {
    it('emits each term once even across nested scopes', async () => {
      const {mappings} = await resolveContext({
        '@context': {
          ex: 'https://example.org/v#',
          Person: {
            '@id': 'ex:Person',
            '@context': {name: 'ex:name'}
          }
        }
      });
      const counts = {};
      for(const m of mappings) {
        counts[m.term] = (counts[m.term] || 0) + 1;
      }
      for(const [term, n] of Object.entries(counts)) {
        expect(n, `term "${term}" appears ${n} times`).to.equal(1);
      }
    });
  });

  describe('real W3C DID context (known-good, must not error)', () => {
    it('produces no error-severity findings', async () => {
      const {loadModel} = await import('../../lib/shell/loadModel.js');
      const {runRules} = await import('../../lib/runRules.js');
      const model = await loadModel({
        vocab: await readJson('did.jsonld'),
        context: await readJson('did.context.jsonld')
      });
      const errors = runRules(model).filter(f => f.severity === 'error');
      expect(errors, JSON.stringify(errors, null, 2)).to.deep.equal([]);
    });

    it('has no duplicate context mappings', async () => {
      const context = await readJson('did.context.jsonld');
      const {mappings} = await resolveContext(context);
      const terms = mappings.map(m => m.term);
      expect(terms.length).to.equal(new Set(terms).size);
    });
  });
});
