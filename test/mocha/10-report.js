/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../../lib/finding.js';
import {exitCodeFor, formatHuman, formatJson} from '../../lib/report.js';
import {expect} from 'chai';

const ERROR = createFinding({
  id: 'ctx/iri-collision',
  severity: SEVERITY.error,
  artifact: ARTIFACT.context,
  term: 'https://example.org/v#name',
  message: 'Two terms map to the same IRI.'
});
const WARNING = createFinding({
  id: 'pair/coverage',
  severity: SEVERITY.warning,
  artifact: ARTIFACT.pairing,
  term: 'https://example.org/v#age',
  message: 'Vocabulary term is not mapped in the context.'
});

describe('report: exitCodeFor', () => {
  it('returns 0 for no findings', () => {
    expect(exitCodeFor([])).to.equal(0);
  });

  it('returns 0 when only warnings are present', () => {
    expect(exitCodeFor([WARNING])).to.equal(0);
  });

  it('returns 1 when any error is present', () => {
    expect(exitCodeFor([WARNING, ERROR])).to.equal(1);
  });
});

describe('report: formatJson', () => {
  it('returns parseable JSON with a findings array and summary', () => {
    const out = formatJson([ERROR, WARNING]);
    const parsed = JSON.parse(out);
    expect(parsed.findings).to.have.lengthOf(2);
    expect(parsed.summary).to.include({error: 1, warning: 1, info: 0});
  });

  it('emits an empty findings array when clean', () => {
    const parsed = JSON.parse(formatJson([]));
    expect(parsed.findings).to.deep.equal([]);
    expect(parsed.summary).to.include({error: 0, warning: 0, info: 0});
  });
});

describe('report: formatHuman', () => {
  it('reports a clean run', () => {
    const out = formatHuman([]);
    expect(out).to.match(/no findings|clean|passed/i);
  });

  it('includes severity, id, term and message for each finding', () => {
    const out = formatHuman([ERROR]);
    expect(out).to.contain('ctx/iri-collision');
    expect(out).to.contain('https://example.org/v#name');
    expect(out).to.contain('Two terms map to the same IRI.');
    expect(out.toLowerCase()).to.contain('error');
  });

  it('includes a summary line counting each severity', () => {
    const out = formatHuman([ERROR, WARNING]);
    expect(out).to.match(/1 error/i);
    expect(out).to.match(/1 warning/i);
  });
});
