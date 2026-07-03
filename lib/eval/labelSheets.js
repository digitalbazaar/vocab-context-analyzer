/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * Spreadsheet-based labeling I/O for the Phase 2 eval golden set (design doc
 * section 2.2 step 4; see docs/LABELING-GUIDE.md). A labeler works in a
 * spreadsheet, not raw JSON: `buildLabelSheets` emits two flat CSVs plus a
 * readable term reference, and `parseLabelSheets` reads the filled CSVs back
 * into validated per-case manifest labels. Both pure — no IO.
 *
 * The two-sheet split follows the data: `overall`/`designRank` are one per
 * case (cases.csv), while `subjectiveIssues` are many per case (issues.csv,
 * one row per issue). The importer joins them by case name.
 */

// the label vocabulary, mirrored from manifestSchema so a filled sheet is
// rejected here with a clear message before it reaches the manifest
const OVERALL = new Set(['good', 'bad', 'borderline']);
const ISSUE_CATEGORY = new Set([
  'naming', 'definition', 'modeling', 'coverage'
]);

const CASES_HEADER = 'name,cohort,overall,designRank';
const ISSUES_HEADER = 'case,term,category,note';

/**
 * Build the labeling sheets and reference for a set of cases.
 *
 * @param {object[]} cases - Loaded cases: `{name, model}`.
 * @param {object} findingsByCase - Map of case name to its `Finding[]`.
 *
 * @returns {{casesCsv: string, issuesCsv: string, reference: string}} The
 *   cases sheet (one row per case, label cells blank), the issues sheet (header
 *   only — the labeler adds rows), and a human-readable term reference.
 */
export function buildLabelSheets(cases, findingsByCase) {
  const caseRows = cases.map(c => _csvRow([c.name, '', '', '']));
  const casesCsv = [CASES_HEADER, ...caseRows].join('\n') + '\n';
  const issuesCsv = ISSUES_HEADER + '\n';
  const reference = cases
    .map(c => _renderReference(c, findingsByCase[c.name] ?? [])).join('\n');
  return {casesCsv, issuesCsv, reference};
}

/**
 * Parse filled labeling sheets into per-case manifest labels. Validates each
 * value against the label vocabulary; throws on the first violation so a
 * malformed sheet is caught before it reaches the manifest.
 *
 * @param {object} sheets - The filled sheets.
 * @param {string} sheets.casesCsv - The cases sheet.
 * @param {string} sheets.issuesCsv - The issues sheet.
 *
 * @returns {object} Map of case name to `{overall, designRank,
 *   subjectiveIssues}`, ready to merge into a manifest entry.
 */
export function parseLabelSheets({casesCsv, issuesCsv}) {
  const labels = {};
  for(const row of _rows(casesCsv, CASES_HEADER)) {
    const [name, , overall, designRank] = row;
    labels[name] = {
      overall: _overall(overall, name),
      designRank: _designRank(designRank, name),
      subjectiveIssues: []
    };
  }
  for(const row of _rows(issuesCsv, ISSUES_HEADER)) {
    const [caseName, term, category, note] = row;
    const entry = labels[caseName];
    if(entry === undefined) {
      throw new Error(
        `Issue references unknown case "${caseName}".`);
    }
    entry.subjectiveIssues.push(_issue({term, category, note}, caseName));
  }
  return labels;
}

function _overall(value, name) {
  if(value === undefined || value === '') {
    return null;
  }
  if(!OVERALL.has(value)) {
    throw new Error(
      `Case "${name}" overall must be one of ${[...OVERALL].join(', ')}; ` +
      `got "${value}".`);
  }
  return value;
}

function _designRank(value, name) {
  if(value === undefined || value === '') {
    return null;
  }
  const rank = Number(value);
  if(!Number.isInteger(rank) || rank < 0) {
    throw new Error(
      `Case "${name}" designRank must be a non-negative integer; ` +
      `got "${value}".`);
  }
  return rank;
}

function _issue({term, category, note}, caseName) {
  if(typeof term !== 'string' || term.length === 0) {
    throw new Error(`Issue in "${caseName}" is missing a term.`);
  }
  if(!ISSUE_CATEGORY.has(category)) {
    throw new Error(
      `Issue in "${caseName}" category must be one of ` +
      `${[...ISSUE_CATEGORY].join(', ')}; got "${category}".`);
  }
  if(typeof note !== 'string' || note.length === 0) {
    throw new Error(`Issue in "${caseName}" is missing a note.`);
  }
  return {term, category, note};
}

// a readable per-case block: the terms to label plus the findings already
// caught, so the labeler reads this instead of the JSON-LD
function _renderReference(testCase, findings) {
  const lines = [`## ${testCase.name}`, ''];
  for(const term of testCase.model.vocab.terms) {
    lines.push(`- ${term.iri}  [${term.kind}]`);
    if(term.label) {
      lines.push(`    label:   ${term.label}`);
    }
    lines.push(`    comment: ${term.comment ?? '(none)'}`);
    if(term.domain) {
      lines.push(`    domain:  ${term.domain.join(', ')}`);
    }
    if(term.range) {
      lines.push(`    range:   ${term.range.join(', ')}`);
    }
  }
  lines.push('', 'Already caught by the rules (do not re-report):');
  if(findings.length === 0) {
    lines.push('  (none)');
  } else {
    for(const f of findings) {
      lines.push(`  - ${f.id}: ${f.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// --- minimal CSV (quote-aware: a field with a comma or quote is double-quoted,
// embedded quotes doubled) ---

function _csvRow(fields) {
  return fields.map(_csvField).join(',');
}

function _csvField(value) {
  const s = String(value);
  if(/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// parse a CSV into data rows (excluding the header), each a string[]. Blank
// lines are skipped. Throws if the header does not match the expected one.
function _rows(csv, expectedHeader) {
  const lines = csv.split('\n').filter(line => line.trim().length > 0);
  if(lines.length === 0) {
    return [];
  }
  if(lines[0].trim() !== expectedHeader) {
    throw new Error(
      `Unexpected CSV header: got "${lines[0].trim()}", ` +
      `expected "${expectedHeader}".`);
  }
  return lines.slice(1).map(_parseLine);
}

function _parseLine(line) {
  const fields = [];
  let field = '';
  let inQuotes = false;
  for(let i = 0; i < line.length; ++i) {
    const ch = line[i];
    if(inQuotes) {
      if(ch === '"') {
        if(line[i + 1] === '"') {
          field += '"';
          ++i;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if(ch === '"') {
      inQuotes = true;
    } else if(ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}
