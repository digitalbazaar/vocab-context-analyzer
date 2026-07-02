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

// Anchors are real, published contexts kept as regression inputs (design doc
// section 2.3), loaded from test/fixtures/golden/anchors.json. Known-good
// anchors must stay finding-free (a false-positive guard); regression anchors
// (exact: true) must produce exactly their confirmed-real finding set, catching
// a rule that newly over- or under-flags a real artifact.
describe('eval: real known-good anchors', () => {
  let cases;
  before(async () => {
    cases = await loadAnchorCases(FIXTURES);
  });

  it('loads every anchor with a model', () => {
    expect(cases.length).to.be.above(0);
    for(const c of cases) {
      expect(c.model, `${c.name} model`).to.be.an('object');
    }
  });

  it('keeps known-good anchors (not exact) finding-free', () => {
    // known-good anchors declare no expected rules and are not exact-match;
    // any finding on one is a false positive
    const known = cases.filter(c => !c.exact);
    expect(known.length, 'has known-good anchors').to.be.above(0);
    const offenders = known
      .map(c => ({name: c.name, ids: runRules(c.model).map(f => f.id)}))
      .filter(o => o.ids.length > 0);
    expect(offenders, `known-good anchors with findings: ` +
      `${JSON.stringify(offenders)}`).to.deep.equal([]);
  });

  it('regression anchors produce exactly their expected finding set', () => {
    // regression anchors pin a real published context to its confirmed-real
    // findings; drift in either direction is a regression
    const regressions = cases.filter(c => c.exact);
    expect(regressions.length, 'has regression anchors').to.be.above(0);
    for(const c of regressions) {
      const ids = [...new Set(runRules(c.model).map(f => f.id))].sort();
      expect(ids, `${c.name} finding ids`)
        .to.deep.equal([...c.expectedRuleIds].sort());
    }
  });

  it('the eval gate passes over all anchors', () => {
    const findingsByCase = {};
    for(const c of cases) {
      findingsByCase[c.name] = runRules(c.model);
    }
    const report = evaluate({cases, findingsByCase});
    expect(report.hardGatePassed).to.equal(true);
  });
});
