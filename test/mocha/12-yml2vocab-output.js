/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {loadModel} from '../../lib/shell/loadModel.js';
import {readFile} from 'node:fs/promises';
import {resolveContext} from '../../lib/shell/resolveContext.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'yml2vocab');

async function readJson(name) {
  return JSON.parse(await readFile(join(FIXTURES, name), 'utf8'));
}

const NS = 'https://example.org/v#';

describe('shell: real yml2vocab output', () => {
  let vocab;
  let context;
  before(async () => {
    vocab = await readJson('sample.jsonld');
    context = await readJson('sample.context.jsonld');
  });

  describe('resolveContext on nested scoped contexts', () => {
    it('resolves terms nested inside a class scoped @context', async () => {
      const {mappings} = await resolveContext(context);
      const byTerm = Object.fromEntries(mappings.map(m => [m.term, m.iri]));
      expect(byTerm.Person).to.equal(`${NS}Person`);
      expect(byTerm.name).to.equal(`${NS}name`);
      expect(byTerm.knows).to.equal(`${NS}knows`);
    });
  });

  describe('loadModel term extraction', () => {
    it('extracts the real vocab terms, not the namespace node', async () => {
      const {vocab: v} = await loadModel({vocab, context});
      const iris = v.terms.map(t => t.iri).sort();
      expect(iris).to.include.members([
        `${NS}Person`, `${NS}name`, `${NS}knows`
      ]);
      // the namespace itself must NOT be a term
      expect(iris).to.not.include(NS);
    });

    it('keeps labels and comments from the vocabulary', async () => {
      const {vocab: v} = await loadModel({vocab, context});
      const person = v.terms.find(t => t.iri === `${NS}Person`);
      expect(person.comment).to.match(/human being/i);
    });
  });

  describe('end to end on clean generated output', () => {
    it('produces no error-severity findings for a clean vocab/context',
      async () => {
        const {runRules} = await import('../../lib/runRules.js');
        const model = await loadModel({vocab, context});
        const errors = runRules(model).filter(f => f.severity === 'error');
        expect(errors).to.deep.equal([]);
      });
  });
});
