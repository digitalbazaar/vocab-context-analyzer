/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {buildFromSource} from '../../lib/shell/buildFromSource.js';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';

const BUILD = join(
  dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'build');

async function readYaml(name) {
  return readFile(join(BUILD, name), 'utf8');
}

// buildFromSource runs yml2vocab over a vocabulary.yml SOURCE (SPEC-build-check
// §3.3). On a clean build it returns the generated {vocab, context} documents;
// on a build failure it returns a single terminal build/yml2vocab-fails finding
// instead. yml2vocab is invoked here but never reaches the pure core.
describe('shell: buildFromSource (yml2vocab build check)', () => {
  describe('a vocabulary that builds', () => {
    let result;
    before(async () => {
      result = await buildFromSource(await readYaml('builds.yml'));
    });

    it('returns generated vocab and context documents', () => {
      expect(result.vocab, 'vocab').to.be.an('object');
      expect(result.context, 'context').to.be.an('object');
    });

    it('emits no build finding', () => {
      expect(result.buildFinding).to.be.undefined;
    });

    it('produces a context with an @context', () => {
      expect(result.context).to.have.property('@context');
    });
  });

  describe('a vocabulary yml2vocab rejects (bad range)', () => {
    let result;
    before(async () => {
      result = await buildFromSource(await readYaml('bad-range.yml'));
    });

    it('returns no generated documents (build is terminal)', () => {
      expect(result.vocab, 'vocab').to.be.undefined;
      expect(result.context, 'context').to.be.undefined;
    });

    it('returns a build/yml2vocab-fails error finding', () => {
      expect(result.buildFinding, 'buildFinding').to.exist;
      expect(result.buildFinding.id).to.equal('build/yml2vocab-fails');
      expect(result.buildFinding.severity).to.equal('error');
    });

    it('passes the yml2vocab message through in the finding', () => {
      expect(result.buildFinding.message).to.contain('prefix "foo" not found');
    });

    it('offers a remediation', () => {
      expect(result.buildFinding.remediation).to.be.a('string')
        .and.have.length.above(0);
    });
  });
});
