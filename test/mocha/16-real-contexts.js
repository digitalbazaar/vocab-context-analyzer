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
  'identification-vocab.context.jsonld',
  'odrl.context.jsonld',
  'statuslist-2021.context.jsonld',
  'vital-records-vocab.context.jsonld'
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

// yml2vocab/DB contexts inline term values as full absolute IRIs with no
// trailing delimiter (e.g. "Event": "http://schema.org/Event"). These look
// like namespace prefixes to a naive authority test, but they are terms and
// must appear in the mappings — otherwise they silently vanish from every
// context rule, producing both false positives (a real term reported
// uncovered) and false negatives (terms excluded from analysis).
describe('shell: full-IRI term values are captured, not dropped as prefixes',
  () => {
    it('captures a top-level class mapped to a full IRI ' +
      '(identification-vocab)', async () => {
      const {mappings} = await resolveContext(
        await readJson('identification-vocab.context.jsonld'));
      const term = mappings.find(
        m => m.term === 'IdentificationDocumentCredential');
      expect(term, 'IdentificationDocumentCredential mapping').to.exist;
      expect(term.iri).to.equal(
        'https://w3id.org/identification#IdentificationDocumentCredential');
    });

    it('captures schema.org class aliases mapped to full IRIs ' +
      '(vital-records-vocab)', async () => {
      const {mappings} = await resolveContext(
        await readJson('vital-records-vocab.context.jsonld'));
      const terms = mappings.map(m => m.term);
      for(const expected of ['Event', 'Observation', 'PostalAddress']) {
        expect(terms, `term ${expected}`).to.include(expected);
      }
    });
  });
