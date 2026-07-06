/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {hasMergeableLabel, mergeLabels} from '../lib/eval/mergeLabels.js';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateLabel} from '../lib/eval/manifestSchema.js';

/**
 * Import the labeling app's saved labels into the committed golden-set
 * manifests (Phase 2 eval gate, design doc section 2.2 step 4; see
 * docs/specs/labeling-app.md). Reads the tracked labels.json the app wrote,
 * validates every label, merges them into both manifest.json and anchors.json,
 * and writes each file back. This is the only path by which expert labels
 * reach the golden standard, so it fails loud: any labeled case that lands in
 * neither manifest is a hard error.
 *
 * Run with: `npm run label:import -- --labeled-by <handle>`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'test', 'fixtures');
const GOLDEN = join(FIXTURES, 'golden');
const GENERATED = join(GOLDEN, 'generated');
const LABELS_JSON = join(GOLDEN, 'labels.json');

const MANIFEST = join(GENERATED, 'manifest.json');
const ANCHORS = join(GOLDEN, 'anchors.json');

async function main() {
  const labeledBy = _labeledByArg(process.argv.slice(2));
  const labeledAt = _today();

  const labels = JSON.parse(await readFile(LABELS_JSON, 'utf8'));
  for(const [name, label] of Object.entries(labels)) {
    validateLabel(label, name);
  }

  // merge both manifests in memory first; nothing is written until every
  // label is known to land, so a failed import never leaves a partial write
  const merged = [];
  const writes = [];
  for(const path of [MANIFEST, ANCHORS]) {
    const entries = JSON.parse(await readFile(path, 'utf8'));
    const result = mergeLabels({entries, labels, labeledBy, labeledAt});
    writes.push({path, entries: result.entries});
    merged.push(...result.merged);
  }

  // every label with content must land: a mergeable case that reached neither
  // manifest is a hard error. Blank rows (nothing to merge) legitimately land
  // nowhere and are not counted.
  const landed = new Set(merged);
  const leftover = Object.keys(labels)
    .filter(name => hasMergeableLabel(labels[name]) && !landed.has(name));
  if(leftover.length > 0) {
    throw new Error(
      `Labeled cases in neither manifest: ${leftover.join(', ')}.`);
  }

  for(const {path, entries} of writes) {
    await _writeJson(path, entries);
  }

  // stderr keeps stdout clean; a summary for the operator
  console.error(
    `imported ${merged.length} label(s) as ${labeledBy} on ${labeledAt}\n` +
    `  ${MANIFEST}\n` +
    `  ${ANCHORS}`);
}

// require --labeled-by <handle>; a missing or empty value is a usage error
function _labeledByArg(argv) {
  const i = argv.indexOf('--labeled-by');
  const value = i === -1 ? undefined : argv[i + 1];
  if(value === undefined || value.length === 0) {
    console.error('usage: label:import -- --labeled-by <handle>');
    process.exit(1);
  }
  return value;
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}

// write a manifest with 2-space indent and a trailing newline, matching the
// committed formatting exactly
function _writeJson(path, value) {
  return writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
