/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY, SOURCE} from '../../lib/finding.js';
import {expect} from 'chai';
import {validateFindings} from '../../lib/findingSchema.js';

describe('finding', () => {
  describe('createFinding', () => {
    it('creates a finding with required fields', () => {
      const finding = createFinding({
        id: 'ctx/iri-collision',
        severity: SEVERITY.error,
        artifact: ARTIFACT.context,
        message: 'Two terms map to the same IRI.'
      });
      expect(finding).to.include({
        id: 'ctx/iri-collision',
        severity: 'error',
        source: 'deterministic',
        artifact: 'context',
        message: 'Two terms map to the same IRI.'
      });
    });

    it('defaults source to deterministic', () => {
      const finding = createFinding({
        id: 'vocab/no-definition',
        severity: SEVERITY.warning,
        artifact: ARTIFACT.vocabulary,
        message: 'Term lacks a definition.'
      });
      expect(finding.source).to.equal('deterministic');
    });

    it('carries optional term and remediation when given', () => {
      const finding = createFinding({
        id: 'pair/orphan',
        severity: SEVERITY.error,
        artifact: ARTIFACT.pairing,
        term: 'ex:ghost',
        message: 'Context maps a term with no vocabulary definition.',
        remediation: 'Remove the mapping or define the term.'
      });
      expect(finding.term).to.equal('ex:ghost');
      expect(finding.remediation).to.equal(
        'Remove the mapping or define the term.');
    });

    it('throws on an unknown severity', () => {
      expect(() => createFinding({
        id: 'x',
        severity: 'fatal',
        artifact: ARTIFACT.context,
        message: 'nope'
      })).to.throw(/severity/);
    });

    it('throws on an unknown artifact', () => {
      expect(() => createFinding({
        id: 'x',
        severity: SEVERITY.error,
        artifact: 'galaxy',
        message: 'nope'
      })).to.throw(/artifact/);
    });

    it('throws when message is missing', () => {
      expect(() => createFinding({
        id: 'x',
        severity: SEVERITY.error,
        artifact: ARTIFACT.context
      })).to.throw(/message/);
    });
  });

  describe('enums', () => {
    it('freezes the enum objects', () => {
      expect(Object.isFrozen(SEVERITY)).to.equal(true);
      expect(Object.isFrozen(SOURCE)).to.equal(true);
      expect(Object.isFrozen(ARTIFACT)).to.equal(true);
    });
  });

  describe('validateFindings', () => {
    it('accepts a valid findings array', () => {
      const findings = [createFinding({
        id: 'ctx/iri-collision',
        severity: SEVERITY.error,
        artifact: ARTIFACT.context,
        message: 'collision'
      })];
      expect(() => validateFindings(findings)).to.not.throw();
    });

    it('rejects a finding with a bad severity', () => {
      const bad = [{
        id: 'x', severity: 'fatal', source: 'deterministic',
        artifact: 'context', message: 'm'
      }];
      expect(() => validateFindings(bad)).to.throw();
    });

    it('rejects a finding missing a required field', () => {
      const bad = [{id: 'x', severity: 'error', artifact: 'context'}];
      expect(() => validateFindings(bad)).to.throw();
    });

    it('rejects a non-array', () => {
      expect(() => validateFindings({})).to.throw();
    });
  });
});
