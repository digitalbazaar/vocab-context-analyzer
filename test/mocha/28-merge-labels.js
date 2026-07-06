/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {mergeLabels} from '../../lib/eval/mergeLabels.js';

const NS = 'https://example.org/v#';

// a case-level label with no subjective issues, the common shape in these tests
function label(overall, designRank) {
  return {overall, designRank, subjectiveIssues: []};
}

// mergeLabels folds a parsed label map into an array of manifest entries. It is
// pure: it returns a new entries array (input untouched) plus the list of case
// names it merged. Fields with null values are omitted so the manifest stays
// clean; existing label fields are replaced, never silently kept; and every
// merged entry is validated against the manifest schema so a merge can never
// produce an invalid manifest entry.
describe('eval: merge labels', () => {
  const labeledBy = 'test-x';
  const labeledAt = '2026-07-04';

  it('sets label fields + provenance and returns merged names', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const labels = {
      good: {overall: 'good', designRank: 1, subjectiveIssues: [
        {term: `${NS}knows`, category: 'naming', note: 'verb-phrase predicate'}
      ]}
    };
    const {entries: merged, merged: names} =
      mergeLabels({entries, labels, labeledBy, labeledAt});
    expect(names).to.deep.equal(['good']);
    expect(merged[0]).to.deep.equal({
      name: 'good', context: 'good.context.jsonld',
      overall: 'good', designRank: 1, subjectiveIssues: [
        {term: `${NS}knows`, category: 'naming', note: 'verb-phrase predicate'}
      ],
      labeledBy, labeledAt
    });
  });

  it('does not mutate the input entries array or its objects', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const snapshot = JSON.parse(JSON.stringify(entries));
    const {entries: out} = mergeLabels({
      entries, labels: {good: label('good', 1)}, labeledBy, labeledAt});
    expect(entries).to.deep.equal(snapshot);
    expect(out).to.not.equal(entries);
    expect(out[0]).to.not.equal(entries[0]);
  });

  it('omits null label fields from the merged entry', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const labels = {good: label('good', null)};
    const {entries: out} = mergeLabels({entries, labels, labeledBy, labeledAt});
    expect(out[0]).to.not.have.property('designRank');
    expect(out[0].overall).to.equal('good');
    // an empty subjectiveIssues array is nothing to merge; omitted too
    expect(out[0]).to.not.have.property('subjectiveIssues');
  });

  it('replaces existing label fields rather than keeping them', () => {
    const entries = [{
      name: 'good', context: 'good.context.jsonld',
      overall: 'bad', designRank: 9,
      subjectiveIssues: [{term: `${NS}x`, category: 'coverage', note: 'old'}],
      labeledBy: 'old', labeledAt: '2000-01-01'
    }];
    const labels = {good: label('good', 1)};
    const {entries: out} = mergeLabels({entries, labels, labeledBy, labeledAt});
    expect(out[0].overall).to.equal('good');
    expect(out[0].designRank).to.equal(1);
    // the old subjectiveIssues are dropped (new label has none)
    expect(out[0]).to.not.have.property('subjectiveIssues');
    expect(out[0].labeledBy).to.equal(labeledBy);
    expect(out[0].labeledAt).to.equal(labeledAt);
  });

  it('passes through an entry with no matching label unchanged', () => {
    const entries = [
      {name: 'good', context: 'good.context.jsonld'},
      {name: 'other', context: 'other.context.jsonld'}
    ];
    const labels = {good: label('good', 1)};
    const {entries: out, merged: names} =
      mergeLabels({entries, labels, labeledBy, labeledAt});
    expect(names).to.deep.equal(['good']);
    expect(out[1]).to.deep.equal(
      {name: 'other', context: 'other.context.jsonld'});
  });

  it('passes through a labeled name with nothing to merge', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const labels = {good: label(null, null)};
    const {entries: out, merged: names} =
      mergeLabels({entries, labels, labeledBy, labeledAt});
    expect(names).to.deep.equal([]);
    expect(out[0]).to.deep.equal(
      {name: 'good', context: 'good.context.jsonld'});
  });

  it('does not list labeled names absent from entries in merged', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const labels = {good: label('good', 1), absent: label('bad', 2)};
    const {merged: names} =
      mergeLabels({entries, labels, labeledBy, labeledAt});
    expect(names).to.deep.equal(['good']);
  });

  it('throws when labeledBy is missing or empty', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const labels = {good: label('good', 1)};
    expect(() => mergeLabels({entries, labels, labeledAt}))
      .to.throw(/labeledBy/);
    expect(() => mergeLabels({entries, labels, labeledBy: '', labeledAt}))
      .to.throw(/labeledBy/);
  });

  it('throws when labeledAt is missing or not YYYY-MM-DD', () => {
    const entries = [{name: 'good', context: 'good.context.jsonld'}];
    const labels = {good: label('good', 1)};
    expect(() => mergeLabels({entries, labels, labeledBy}))
      .to.throw(/labeledAt/);
    expect(() => mergeLabels({
      entries, labels, labeledBy, labeledAt: '07/04/2026'}))
      .to.throw(/labeledAt/);
  });

  it('throws when a merge would produce an invalid manifest entry', () => {
    // an unexpected key on the entry survives merge, so the schema catches it
    const entries = [{name: 'good', context: 'good.context.jsonld', bogus: 1}];
    const labels = {good: label('good', 1)};
    expect(() => mergeLabels({entries, labels, labeledBy, labeledAt}))
      .to.throw(/bogus/);
  });
});
