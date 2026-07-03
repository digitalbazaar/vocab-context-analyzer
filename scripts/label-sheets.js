/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {buildLabelSheets} from '../lib/eval/labelSheets.js';
import {fileURLToPath} from 'node:url';
import {loadCases} from '../lib/eval/loadCases.js';
import {runRules} from '../lib/runRules.js';

/**
 * Generate the spreadsheet-based labeling kit for the golden set (Phase 2 eval
 * gate, design doc section 2.2 step 4; see docs/LABELING-GUIDE.md). Writes two
 * CSVs a labeler edits in a spreadsheet — cases.csv (one row per case) and
 * issues.csv (one row per subjective issue) — plus reference.md, a readable
 * term view with the deterministic findings already caught. Deterministic, no
 * LLM.
 *
 * The output is a hand-off artifact, not a committed fixture: it goes to a
 * git-ignored dir and is regenerated on demand. The filled CSVs are read back
 * by `parseLabelSheets` (lib/eval/labelSheets.js).
 *
 * Run with: `npm run label:sheets`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test', 'fixtures');
const GENERATED = join(FIXTURES, 'golden', 'generated');
const OUT = join(FIXTURES, 'golden', 'labeling');

const readFromGenerated = name =>
  readFile(join(GENERATED, name), 'utf8').then(JSON.parse);
const readFromFixtures = name =>
  readFile(join(FIXTURES, name), 'utf8').then(JSON.parse);

async function main() {
  const golden = JSON.parse(
    await readFile(join(GENERATED, 'manifest.json'), 'utf8'));
  const anchors = JSON.parse(
    await readFile(join(FIXTURES, 'golden', 'anchors.json'), 'utf8'));

  const cases = [
    ...await loadCases({entries: golden, readJson: readFromGenerated}),
    ...await loadCases({entries: anchors, readJson: readFromFixtures})
  ];

  const findingsByCase = {};
  for(const c of cases) {
    findingsByCase[c.name] = runRules(c.model);
  }

  const {casesCsv, issuesCsv, reference} =
    buildLabelSheets(cases, findingsByCase);

  await mkdir(OUT, {recursive: true});
  await writeFile(join(OUT, 'cases.csv'), casesCsv);
  await writeFile(join(OUT, 'issues.csv'), issuesCsv);
  await writeFile(join(OUT, 'reference.md'), reference);

  // stderr keeps stdout clean; a summary for the operator
  console.error(
    `wrote labeling kit for ${cases.length} cases to ${OUT}\n` +
    '  cases.csv    — one row per case: fill overall + designRank\n' +
    '  issues.csv   — add one row per subjective issue\n' +
    '  reference.md — the terms and already-caught findings to read');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
