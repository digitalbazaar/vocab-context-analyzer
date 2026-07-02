/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {evaluate} from '../lib/eval/runEval.js';
import {fileURLToPath} from 'node:url';
import {loadAnchorCases} from './loadAnchors.js';
import {loadModel} from '../lib/shell/loadModel.js';
import {readFile} from 'node:fs/promises';
import {runRules} from '../lib/runRules.js';

/**
 * Run the eval gate over the golden set (PLAN-eval-runner, design doc section
 * 4). The imperative shell for {@link module:eval/runEval~evaluate}: it reads
 * the manifest, loads each case's vocabulary and context, runs the
 * deterministic rules, computes the gate metrics, prints the report as JSON,
 * and exits non-zero if a hard gate fails.
 *
 * Deterministic — no LLM call, no model key. The LLM-dependent metrics
 * (precision/recall/ρ) belong to a separate, manually-triggered calibration
 * run. This is what the CI `eval` job invokes.
 *
 * Run with: `npm run eval`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test', 'fixtures');
const GENERATED = join(FIXTURES, 'golden', 'generated');

async function readJson(name) {
  return JSON.parse(await readFile(join(GENERATED, name), 'utf8'));
}

async function main() {
  const manifest = await readJson('manifest.json');

  const cases = [];
  for(const entry of manifest) {
    const model = await loadModel({
      vocab: await readJson(entry.vocab),
      context: await readJson(entry.context)
    });
    cases.push({
      name: entry.name, model, expectedRuleIds: entry.expectedRuleIds ?? []
    });
  }
  // known-good anchors: real published contexts that must stay finding-free
  cases.push(...await loadAnchorCases(FIXTURES));

  const findingsByCase = {};
  for(const c of cases) {
    findingsByCase[c.name] = runRules(c.model);
  }

  const report = evaluate({cases, findingsByCase});
  // stdout carries ONLY the JSON report, so `npm run eval > report.json` stays
  // parseable (the design doc records the report for reproducibility). Human
  // summaries go to stderr on both the pass and fail paths.
  console.log(JSON.stringify(report, null, 2));

  if(!report.hardGatePassed) {
    console.error('\neval gate FAILED: a hard gate was not satisfied.');
    process.exit(1);
  }
  console.error(
    `\neval gate passed: recall ${report.recall.caught}/` +
    `${report.recall.seeded}, ${cases.length} cases.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
