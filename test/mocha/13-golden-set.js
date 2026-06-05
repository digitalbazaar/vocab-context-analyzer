/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {loadModel} from '../../lib/shell/loadModel.js';
import {readFile} from 'node:fs/promises';
import {runRules} from '../../lib/runRules.js';

const GENERATED = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'golden', 'generated');

async function readJson(name) {
  return JSON.parse(await readFile(join(GENERATED, name), 'utf8'));
}

describe('golden set (SPEC section 7 eval gate)', () => {
  let manifest;
  before(async () => {
    manifest = await readJson('manifest.json');
  });

  it('has a manifest with the good baseline and seeded-defect cases', () => {
    const names = manifest.map(c => c.name);
    expect(names).to.include('good');
    expect(names.filter(n => n.startsWith('broken-'))).to.have.length.above(0);
  });

  it('reports no findings for the good baseline', async () => {
    const c = manifest.find(entry => entry.name === 'good');
    const model = await loadModel({
      vocab: await readJson(c.vocab), context: await readJson(c.context)
    });
    expect(runRules(model)).to.deep.equal([]);
  });

  // recall = 1.0: every seeded defect must be flagged by its expected rule.
  // This is the release gate from SPEC section 7.3.
  describe('seeded-defect recall', () => {
    for(const name of [
      'broken-no-definition', 'broken-uncovered', 'broken-orphan',
      'broken-collision', 'broken-unresolved'
    ]) {
      it(`flags the seeded defect in ${name}`, async () => {
        // resolved lazily so each case reads its own manifest entry
        const list = await readJson('manifest.json');
        const c = list.find(entry => entry.name === name);
        expect(c, `manifest entry for ${name}`).to.exist;
        const model = await loadModel({
          vocab: await readJson(c.vocab), context: await readJson(c.context)
        });
        const ids = runRules(model).map(f => f.id);
        for(const expectedId of c.expectedRuleIds) {
          expect(ids, `${name} should flag ${expectedId}`)
            .to.include(expectedId);
        }
      });
    }
  });

  it('achieves recall 1.0 across all seeded defects', async () => {
    let seeded = 0;
    let caught = 0;
    for(const c of manifest) {
      if(c.expectedRuleIds.length === 0) {
        continue;
      }
      const model = await loadModel({
        vocab: await readJson(c.vocab), context: await readJson(c.context)
      });
      const ids = new Set(runRules(model).map(f => f.id));
      for(const expectedId of c.expectedRuleIds) {
        seeded++;
        if(ids.has(expectedId)) {
          caught++;
        }
      }
    }
    expect(caught, `caught ${caught} of ${seeded} seeded defects`)
      .to.equal(seeded);
  });
});
