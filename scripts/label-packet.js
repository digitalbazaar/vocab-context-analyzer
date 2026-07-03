/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {buildLabelPacket} from '../lib/eval/labelPacket.js';
import {fileURLToPath} from 'node:url';
import {loadCases} from '../lib/eval/loadCases.js';
import {runRules} from '../lib/runRules.js';

/**
 * Generate human-labeling packets for the golden set (Phase 2 eval gate, design
 * doc section 2.2 step 4; see docs/LABELING-GUIDE.md). For each case it renders
 * a readable term view plus the deterministic findings already caught, and
 * writes an empty label stub for the labeler to fill. Deterministic, no LLM.
 *
 * The packets are a hand-off artifact, not a committed fixture: they are
 * written to a git-ignored output dir and regenerated on demand.
 *
 * Run with: `npm run label:packets`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test', 'fixtures');
const GENERATED = join(FIXTURES, 'golden', 'generated');
const OUT = join(FIXTURES, 'golden', 'packets');

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

  await rm(OUT, {recursive: true, force: true});
  await mkdir(OUT, {recursive: true});

  for(const c of cases) {
    const packet = buildLabelPacket(c, runRules(c.model));
    await writeFile(
      join(OUT, `${c.name}.json`), JSON.stringify(packet, null, 2) + '\n');
  }

  // stderr keeps stdout free for piping; a summary line for the operator
  console.error(
    `wrote ${cases.length} labeling packets to ${OUT}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
