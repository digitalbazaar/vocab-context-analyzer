/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {evaluate} from '../lib/eval/runEval.js';
import {fileURLToPath} from 'node:url';
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
const GENERATED = join(
  HERE, '..', 'test', 'fixtures', 'golden', 'generated');

async function readJson(name) {
  return JSON.parse(await readFile(join(GENERATED, name), 'utf8'));
}

async function main() {
  const manifest = await readJson('manifest.json');

  const cases = [];
  const findingsByCase = {};
  for(const entry of manifest) {
    const model = await loadModel({
      vocab: await readJson(entry.vocab),
      context: await readJson(entry.context)
    });
    cases.push({
      name: entry.name, model, expectedRuleIds: entry.expectedRuleIds ?? []
    });
    findingsByCase[entry.name] = runRules(model);
  }

  const report = evaluate({cases, findingsByCase});
  console.log(JSON.stringify(report, null, 2));

  if(!report.hardGatePassed) {
    console.error('\neval gate FAILED: a hard gate was not satisfied.');
    process.exit(1);
  }
  console.log(
    `\neval gate passed: recall ${report.recall.caught}/` +
    `${report.recall.seeded}, ${cases.length} cases.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
