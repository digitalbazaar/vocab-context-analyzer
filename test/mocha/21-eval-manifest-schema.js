/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {
  validateLabel, validateManifestEntry
} from '../../lib/eval/manifestSchema.js';
import {expect} from 'chai';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(
  HERE, '..', 'fixtures', 'golden', 'generated', 'manifest.json');

const NS = 'https://example.org/v#';

// a minimal Phase-1-only entry (the shape the existing manifest.json uses)
function phase1Entry(overrides = {}) {
  return {
    name: 'good',
    vocab: 'good.jsonld',
    context: 'good.context.jsonld',
    expectedRuleIds: [],
    ...overrides
  };
}

describe('eval: manifest schema', () => {
  it('accepts a Phase 1-only entry (no Phase 2 labels)', () => {
    expect(() => validateManifestEntry(phase1Entry())).to.not.throw();
  });

  it('returns the same entry when valid', () => {
    const entry = phase1Entry();
    expect(validateManifestEntry(entry)).to.equal(entry);
  });

  it('requires name and context as non-empty strings', () => {
    expect(() => validateManifestEntry(phase1Entry({name: ''})))
      .to.throw(/name/);
    expect(() => validateManifestEntry(phase1Entry({context: undefined})))
      .to.throw(/context/);
  });

  it('allows a context-only entry (no vocab) but rejects a non-string vocab',
    () => {
      // a context-only anchor omits vocab; the loader builds the model from
      // the context alone
      const contextOnly = phase1Entry();
      delete contextOnly.vocab;
      expect(() => validateManifestEntry(contextOnly)).to.not.throw();
      expect(() => validateManifestEntry(phase1Entry({vocab: 42})))
        .to.throw(/vocab/);
    });

  it('accepts exact as a boolean and rejects a non-boolean', () => {
    expect(() => validateManifestEntry(phase1Entry({exact: true})))
      .to.not.throw();
    expect(() => validateManifestEntry(phase1Entry({exact: 'yes'})))
      .to.throw(/exact/);
  });

  it('requires expectedRuleIds to be an array of strings', () => {
    expect(() => validateManifestEntry(phase1Entry({expectedRuleIds: 'x'})))
      .to.throw(/expectedRuleIds/);
    expect(() => validateManifestEntry(phase1Entry({expectedRuleIds: [1]})))
      .to.throw(/expectedRuleIds/);
  });

  it('rejects unexpected top-level keys', () => {
    expect(() => validateManifestEntry(phase1Entry({bogus: true})))
      .to.throw(/bogus/);
  });

  it('accepts a full Phase 2-labeled entry', () => {
    const entry = phase1Entry({
      overall: 'good',
      designRank: 3,
      subjectiveIssues: [
        {term: `${NS}knows`, category: 'naming', note: 'verb-phrase predicate'}
      ],
      labeledBy: 'expert-1',
      labeledAt: '2026-06-29'
    });
    expect(() => validateManifestEntry(entry)).to.not.throw();
  });

  it('rejects an out-of-range overall label', () => {
    const entry = phase1Entry({overall: 'excellent'});
    expect(() => validateManifestEntry(entry)).to.throw(/overall/);
  });

  it('accepts each valid overall band', () => {
    for(const overall of ['good', 'bad', 'borderline']) {
      const entry = phase1Entry({overall});
      expect(() => validateManifestEntry(entry)).to.not.throw();
    }
  });

  it('requires designRank to be a non-negative integer when present', () => {
    expect(() => validateManifestEntry(phase1Entry({designRank: -1})))
      .to.throw(/designRank/);
    expect(() => validateManifestEntry(phase1Entry({designRank: 1.5})))
      .to.throw(/designRank/);
  });

  it('validates subjectiveIssues entries (term, category, note)', () => {
    expect(() => validateManifestEntry(phase1Entry({
      subjectiveIssues: [{term: `${NS}x`, category: 'bogus', note: 'n'}]
    }))).to.throw(/category/);
    expect(() => validateManifestEntry(phase1Entry({
      subjectiveIssues: [{category: 'naming', note: 'n'}]
    }))).to.throw(/term/);
  });

  it('accepts each valid subjectiveIssue category', () => {
    for(const category of ['naming', 'definition', 'modeling', 'coverage']) {
      const entry = phase1Entry({
        subjectiveIssues: [{term: `${NS}x`, category, note: 'n'}]
      });
      expect(() => validateManifestEntry(entry)).to.not.throw();
    }
  });

  it('validates the committed golden manifest (oracle stays in shape)', () => {
    const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    expect(manifest).to.be.an('array').with.length.greaterThan(0);
    for(const entry of manifest) {
      expect(() => validateManifestEntry(entry)).to.not.throw();
    }
  });

  // validateLabel guards the labeling app's save/import payloads — the shape
  // labels.json uses, where null (not absence) marks an unset field
  describe('validateLabel', () => {
    const label = (overrides = {}) => ({
      overall: null, designRank: null, subjectiveIssues: [], ...overrides
    });

    it('accepts an unset label (all nulls, empty issues)', () => {
      expect(() => validateLabel(label(), 'good')).to.not.throw();
    });

    it('accepts a full valid label', () => {
      expect(() => validateLabel(label({
        overall: 'borderline', designRank: 3,
        subjectiveIssues: [
          {term: `${NS}knows`, category: 'naming', note: 'verb phrase'}
        ]
      }), 'good')).to.not.throw();
    });

    it('rejects an out-of-band overall, naming the case', () => {
      expect(() => validateLabel(label({overall: 'excellent'}), 'did'))
        .to.throw(/Label for "did".*overall/);
    });

    it('rejects a negative designRank', () => {
      expect(() => validateLabel(label({designRank: -1}), 'good'))
        .to.throw(/designRank/);
    });

    it('rejects a missing subjectiveIssues array', () => {
      expect(() => validateLabel(
        {overall: null, designRank: null}, 'good'))
        .to.throw(/subjectiveIssues/);
    });

    it('rejects an issue with an off-rubric category', () => {
      expect(() => validateLabel(label({
        subjectiveIssues: [{term: `${NS}x`, category: 'bogus', note: 'n'}]
      }), 'good')).to.throw(/category/);
    });

    it('rejects unexpected keys', () => {
      expect(() => validateLabel(label({extra: true}), 'good'))
        .to.throw(/unexpected key "extra"/);
    });
  });
});
