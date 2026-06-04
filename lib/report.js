/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {SEVERITY} from './finding.js';

/**
 * Pure reporting: turn a `Finding[]` into output text and a process exit code.
 * No IO — the CLI shell does the reading and writing.
 */

/**
 * The CI exit code for a set of findings. Non-zero only when an `error`
 * severity finding is present; warnings and info do not fail the build (SPEC
 * section 11.1.3). Usage/IO errors are signaled separately by the CLI shell.
 *
 * @param {object[]} findings - The findings.
 *
 * @returns {number} `1` if any error is present, otherwise `0`.
 */
export function exitCodeFor(findings) {
  return findings.some(f => f.severity === SEVERITY.error) ? 1 : 0;
}

/**
 * Render findings as a JSON report string (machine-readable output).
 *
 * @param {object[]} findings - The findings.
 *
 * @returns {string} Pretty-printed JSON with `findings` and a `summary`.
 */
export function formatJson(findings) {
  return JSON.stringify({summary: _summarize(findings), findings}, null, 2);
}

/**
 * Render findings as a human-readable report string.
 *
 * @param {object[]} findings - The findings.
 *
 * @returns {string} The report.
 */
export function formatHuman(findings) {
  if(findings.length === 0) {
    return 'No findings — vocabulary and context passed all checks.';
  }
  const lines = findings.map(_formatLine);
  lines.push('', _summaryLine(findings));
  return lines.join('\n');
}

function _formatLine({severity, id, term, message}) {
  const head = `${severity.toUpperCase()} [${id}]`;
  const where = term ? ` ${term}` : '';
  return `${head}${where}\n  ${message}`;
}

function _summarize(findings) {
  const summary = {error: 0, warning: 0, info: 0};
  for(const {severity} of findings) {
    summary[severity]++;
  }
  return summary;
}

function _summaryLine(findings) {
  const {error, warning, info} = _summarize(findings);
  return `${_count(error, 'error')}, ${_count(warning, 'warning')}, ` +
    `${_count(info, 'info')}.`;
}

function _count(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}
