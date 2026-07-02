/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {join} from 'node:path';
import {loadModel} from '../lib/shell/loadModel.js';
import {readFile} from 'node:fs/promises';

/**
 * Load the anchor cases for the eval gate (design doc section 2.3). Anchors are
 * real, published contexts kept as regression inputs. A known-good anchor
 * (`expectedRuleIds: []`) must stay finding-free — a false-positive guard. A
 * regression anchor (`exact: true` with a non-empty `expectedRuleIds`) must
 * produce exactly that finding set — a guard against a rule newly
 * over/under-flagging a real artifact. They are declared in
 * `test/fixtures/golden/anchors.json`, are context-only (no vocabulary), and
 * their context paths are relative to the fixtures root.
 *
 * @param {string} fixturesDir - Absolute path to `test/fixtures`.
 *
 * @returns {Promise<object[]>} Eval-ready cases: `{name, model,
 *   expectedRuleIds, exact}`, one per anchor.
 */
export async function loadAnchorCases(fixturesDir) {
  const manifestPath = join(fixturesDir, 'golden', 'anchors.json');
  const anchors = JSON.parse(await readFile(manifestPath, 'utf8'));

  const cases = [];
  for(const anchor of anchors) {
    const context = JSON.parse(
      await readFile(join(fixturesDir, anchor.context), 'utf8'));
    // most anchors are context-only; a regression anchor over a vocabulary
    // (e.g. did, whose findings are vocab-side) declares a `vocab` path so the
    // model pairs the real vocabulary with its context
    const vocab = anchor.vocab ? JSON.parse(
      await readFile(join(fixturesDir, anchor.vocab), 'utf8')) : {};
    const model = await loadModel({vocab, context});
    cases.push({
      name: anchor.name, model, expectedRuleIds: anchor.expectedRuleIds ?? [],
      // a regression anchor asserts an EXACT finding set (see runEval.js); a
      // known-good anchor omits `exact` and is held to the clean-case rule
      exact: anchor.exact === true
    });
  }
  return cases;
}
