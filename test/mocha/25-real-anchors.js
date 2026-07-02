/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {evaluate} from '../../lib/eval/runEval.js';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {loadAnchorCases} from '../../scripts/loadAnchors.js';
import {runRules} from '../../lib/runRules.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

// The known-good anchors are real, published contexts that must stay
// finding-free (design doc section 2.3). They guard against false positives: a
// rule change that starts flagging one of these regresses the gate. They are
// context-only (no vocabulary) and loaded from
// test/fixtures/golden/anchors.json.
describe('eval: real known-good anchors', () => {
  let cases;
  before(async () => {
    cases = await loadAnchorCases(FIXTURES);
  });

  it('loads every anchor as a context-only case', () => {
    expect(cases.length).to.be.above(0);
    for(const c of cases) {
      expect(c.model, `${c.name} model`).to.be.an('object');
      expect(c.expectedRuleIds, `${c.name} expects clean`).to.deep.equal([]);
    }
  });

  it('produces zero findings for every anchor (false-positive guard)', () => {
    const findingsByCase = {};
    for(const c of cases) {
      findingsByCase[c.name] = runRules(c.model);
    }
    const report = evaluate({cases, findingsByCase});
    // any finding on a known-good context is a false positive: surface which
    const offenders = cases
      .map(c => ({name: c.name, ids: findingsByCase[c.name].map(f => f.id)}))
      .filter(o => o.ids.length > 0);
    expect(offenders, `anchors with findings: ${JSON.stringify(offenders)}`)
      .to.deep.equal([]);
    expect(report.recall.rate).to.equal(1);
    expect(report.hardGatePassed).to.equal(true);
  });
});
