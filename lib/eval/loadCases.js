/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {loadModel} from '../shell/loadModel.js';
import {validateManifestEntry} from './manifestSchema.js';

/**
 * Build eval-ready cases from manifest entries — the shared loader for both the
 * generated golden set (`generated/manifest.json`) and the real-context anchors
 * (`golden/anchors.json`). Each entry is validated against the manifest schema,
 * its `vocab`/`context` documents are resolved through the injected `readJson`,
 * and the model is built. `vocab` is optional: a context-only entry (an anchor)
 * gets a model built from the context alone.
 *
 * Path resolution is the caller's concern via `readJson` — the golden set reads
 * from `generated/`, anchors from the fixtures root — so this stays free of any
 * directory knowledge.
 *
 * @param {object} input - The input.
 * @param {object[]} input.entries - Manifest entries.
 * @param {Function} input.readJson - `(relativePath) => Promise<object>`,
 *   resolves and parses a document referenced by an entry.
 *
 * @returns {Promise<object[]>} Cases: `{name, model, expectedRuleIds, exact}`.
 */
export async function loadCases({entries, readJson}) {
  const cases = [];
  for(const entry of entries) {
    validateManifestEntry(entry);
    const context = await readJson(entry.context);
    // vocab is optional; a context-only case builds its model from the context
    const vocab = entry.vocab ? await readJson(entry.vocab) : {};
    const model = await loadModel({vocab, context});
    cases.push({
      name: entry.name, model, expectedRuleIds: entry.expectedRuleIds ?? [],
      exact: entry.exact === true
    });
  }
  return cases;
}
