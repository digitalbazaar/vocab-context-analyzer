/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {validateManifestEntry} from './manifestSchema.js';

/**
 * Fold a label map (the labeling app's `labels.json` shape) into an array of
 * manifest entries. Pure — no IO; the input `entries` array and its objects
 * are never mutated. This is the merge half of the label-import pipeline: the
 * shell reads and validates labels.json, then calls this once per manifest
 * file.
 *
 * For each entry whose `name` appears in `labels` and has something to merge
 * (a non-null `overall`, a non-null `designRank`, or a non-empty
 * `subjectiveIssues`), a new entry object is returned with those label fields
 * set — null fields omitted so the manifest stays clean — plus `labeledBy` and
 * `labeledAt` provenance. Any label fields already on the entry are replaced,
 * never silently kept. Entries not in `labels`, or in `labels` with nothing to
 * merge, pass through unchanged.
 *
 * Labeled names absent from `entries` are simply not reported in `merged`; this
 * does not throw, because labels span two manifest files and per-call misses
 * are expected — the caller detects labels that land in neither file. Every
 * merged entry is validated against the manifest schema, so a merge can never
 * produce an invalid manifest entry.
 *
 * @param {object} input - The input.
 * @param {object[]} input.entries - The manifest entries to merge into.
 * @param {object} input.labels - Map of case name to `{overall, designRank,
 *   subjectiveIssues}`.
 * @param {string} input.labeledBy - Non-empty labeler handle for provenance.
 * @param {string} input.labeledAt - Label date as a `YYYY-MM-DD` string.
 *
 * @returns {{entries: object[], merged: string[]}} A new entries array and the
 *   names of the cases that were merged.
 */
export function mergeLabels({entries, labels, labeledBy, labeledAt}) {
  if(typeof labeledBy !== 'string' || labeledBy.length === 0) {
    throw new TypeError('mergeLabels "labeledBy" must be a non-empty string.');
  }
  if(typeof labeledAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(labeledAt)) {
    throw new TypeError('mergeLabels "labeledAt" must be a YYYY-MM-DD string.');
  }
  const merged = [];
  const out = entries.map(entry => {
    const label = labels[entry.name];
    if(label === undefined || !hasMergeableLabel(label)) {
      return entry;
    }
    merged.push(entry.name);
    return _mergeEntry(entry, label, labeledBy, labeledAt);
  });
  return {entries: out, merged};
}

/**
 * Whether a parsed label carries anything to merge — a non-null `overall`, a
 * non-null `designRank`, or a non-empty `subjectiveIssues`. A blank sheet row
 * parses to a label with none of these, so it contributes nothing. Exported so
 * the import shell can tell "nothing to merge" (fine, lands nowhere) from "was
 * supposed to land but didn't" (a hard error).
 *
 * @param {object} label - A parsed label `{overall, designRank,
 *   subjectiveIssues}`.
 *
 * @returns {boolean} True when the label has at least one verdict field set.
 */
export function hasMergeableLabel(label) {
  return label.overall !== null || label.designRank !== null ||
    (Array.isArray(label.subjectiveIssues) &&
      label.subjectiveIssues.length > 0);
}

// build a fresh entry: the entry's non-label fields, then the label fields
// (replacing any prior ones), omitting nulls, plus provenance. Validated so an
// invalid merge throws rather than reaching the manifest.
function _mergeEntry(entry, label, labeledBy, labeledAt) {
  const next = {...entry};
  // clear any prior label fields so stale values are never kept
  delete next.overall;
  delete next.designRank;
  delete next.subjectiveIssues;
  if(label.overall !== null) {
    next.overall = label.overall;
  }
  if(label.designRank !== null) {
    next.designRank = label.designRank;
  }
  if(Array.isArray(label.subjectiveIssues) &&
    label.subjectiveIssues.length > 0) {
    next.subjectiveIssues = label.subjectiveIssues;
  }
  next.labeledBy = labeledBy;
  next.labeledAt = labeledAt;
  return validateManifestEntry(next);
}
