/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {join} from 'node:path';
import {loadModel} from '../lib/shell/loadModel.js';
import {readFile} from 'node:fs/promises';

/**
 * Load the known-good anchor cases for the eval gate (design doc section 2.3).
 * Anchors are real, published contexts that must stay finding-free; they guard
 * the gate against false positives. They are declared in
 * `test/fixtures/golden/anchors.json`, are context-only (no vocabulary), and
 * their context paths are relative to the fixtures root.
 *
 * @param {string} fixturesDir - Absolute path to `test/fixtures`.
 *
 * @returns {Promise<object[]>} Eval-ready cases: `{name, model,
 *   expectedRuleIds}`, one per anchor.
 */
export async function loadAnchorCases(fixturesDir) {
  const manifestPath = join(fixturesDir, 'golden', 'anchors.json');
  const anchors = JSON.parse(await readFile(manifestPath, 'utf8'));

  const cases = [];
  for(const anchor of anchors) {
    const context = JSON.parse(
      await readFile(join(fixturesDir, anchor.context), 'utf8'));
    // anchors are context-only; a real vocabulary is not part of the artifact,
    // so the model is built from the context alone
    const model = await loadModel({vocab: {}, context});
    cases.push({
      name: anchor.name, model, expectedRuleIds: anchor.expectedRuleIds ?? []
    });
  }
  return cases;
}
