/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../../lib/finding.js';
import {expect} from 'chai';
import {run} from '../../lib/cli.js';

// stub deps so CLI tests stay pure (no disk, no real analysis)
const docs = {
  'v.jsonld': {vocab: true},
  'v.context.jsonld': {context: true}
};
const readFileFn = async path => {
  if(!(path in docs)) {
    const err = new Error(`ENOENT: ${path}`);
    throw err;
  }
  return docs[path];
};
const loadModelFn = async () => ({vocab: {terms: []}, context: {mappings: []}});

function rulesReturning(findings) {
  return () => findings;
}

const baseArgs = ['--vocab', 'v.jsonld', '--context', 'v.context.jsonld'];

describe('cli: run', () => {
  it('prints help with --help and exits 0', async () => {
    const {stdout, code} = await run(['--help']);
    expect(stdout).to.contain('Usage:');
    expect(code).to.equal(0);
  });

  it('exits 2 when required flags are missing', async () => {
    const {code, stderr} = await run(['--vocab', 'v.jsonld']);
    expect(code).to.equal(2);
    expect(stderr).to.contain('required');
  });

  it('exits 2 on an unknown argument', async () => {
    const {code, stderr} = await run([...baseArgs, '--wat']);
    expect(code).to.equal(2);
    expect(stderr).to.contain('Unknown argument');
  });

  it('exits 2 on an invalid --format', async () => {
    const {code, stderr} = await run([...baseArgs, '--format', 'xml']);
    expect(code).to.equal(2);
    expect(stderr).to.contain('format');
  });

  it('exits 2 when a file cannot be read', async () => {
    const {code, stderr} = await run(
      ['--vocab', 'missing.jsonld', '--context', 'v.context.jsonld'],
      {readFileFn, loadModelFn, runRulesFn: rulesReturning([])});
    expect(code).to.equal(2);
    expect(stderr).to.contain('Failed to read input');
  });

  it('exits 0 and prints a clean human report when no findings', async () => {
    const {stdout, code} = await run(baseArgs,
      {readFileFn, loadModelFn, runRulesFn: rulesReturning([])});
    expect(code).to.equal(0);
    expect(stdout).to.match(/no findings/i);
  });

  it('exits 1 when an error-severity finding is present', async () => {
    const error = createFinding({
      id: 'ctx/iri-collision', severity: SEVERITY.error,
      artifact: ARTIFACT.context, message: 'collision'
    });
    const {code} = await run(baseArgs,
      {readFileFn, loadModelFn, runRulesFn: rulesReturning([error])});
    expect(code).to.equal(1);
  });

  it('exits 0 when only warnings are present', async () => {
    const warning = createFinding({
      id: 'pair/coverage', severity: SEVERITY.warning,
      artifact: ARTIFACT.pairing, message: 'uncovered'
    });
    const {code} = await run(baseArgs,
      {readFileFn, loadModelFn, runRulesFn: rulesReturning([warning])});
    expect(code).to.equal(0);
  });

  it('emits JSON with --format json', async () => {
    const error = createFinding({
      id: 'ctx/iri-collision', severity: SEVERITY.error,
      artifact: ARTIFACT.context, message: 'collision'
    });
    const {stdout} = await run([...baseArgs, '--format', 'json'],
      {readFileFn, loadModelFn, runRulesFn: rulesReturning([error])});
    const parsed = JSON.parse(stdout);
    expect(parsed.findings).to.have.lengthOf(1);
    expect(parsed.summary.error).to.equal(1);
  });

  it('exits 2 when analysis throws', async () => {
    const {code, stderr} = await run(baseArgs, {
      readFileFn,
      loadModelFn: async () => {
        throw new Error('bad jsonld');
      },
      runRulesFn: rulesReturning([])
    });
    expect(code).to.equal(2);
    expect(stderr).to.contain('Analysis failed');
  });
});
