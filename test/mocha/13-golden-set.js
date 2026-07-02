/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {evaluate} from '../../lib/eval/runEval.js';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {loadCases} from '../../lib/eval/loadCases.js';
import {loadModel} from '../../lib/shell/loadModel.js';
import {readFile as readFileAsync} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {runRules} from '../../lib/runRules.js';

const GENERATED = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', 'fixtures', 'golden', 'generated');

async function readJson(name) {
  return JSON.parse(await readFileAsync(join(GENERATED, name), 'utf8'));
}

// read the manifest synchronously at load time so the per-case recall tests can
// be generated from it — every defect case is covered without maintaining a
// hard-coded list that drifts as the golden set grows.
const DEFECT_CASES = JSON.parse(
  readFileSync(join(GENERATED, 'manifest.json'), 'utf8'))
  .filter(entry => (entry.expectedRuleIds ?? []).length > 0);

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
    for(const c of DEFECT_CASES) {
      it(`flags the seeded defect in ${c.name}`, async () => {
        const model = await loadModel({
          vocab: await readJson(c.vocab), context: await readJson(c.context)
        });
        const ids = runRules(model).map(f => f.id);
        for(const expectedId of c.expectedRuleIds) {
          expect(ids, `${c.name} should flag ${expectedId}`)
            .to.include(expectedId);
        }
      });
    }
  });

  // the release gate itself, driven through the eval runner (PLAN-eval-runner)
  // rather than an inline loop, so this test exercises the same evaluate() the
  // CI eval job runs.
  it('achieves recall 1.0 across all seeded defects', async () => {
    const cases = await loadCases({entries: manifest, readJson});
    const findingsByCase = {};
    for(const c of cases) {
      findingsByCase[c.name] = runRules(c.model);
    }
    const report = evaluate({cases, findingsByCase});
    expect(report.recall.rate,
      `caught ${report.recall.caught} of ${report.recall.seeded}`)
      .to.equal(1);
    expect(report.hardGatePassed).to.equal(true);
  });
});
