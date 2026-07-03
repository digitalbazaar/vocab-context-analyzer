/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {
  buildLabelSheets, parseLabelSheets
} from '../../lib/eval/labelSheets.js';
import {expect} from 'chai';

const NS = 'https://example.org/v#';

function caseWith(name, terms) {
  return {
    name, model: {vocab: {namespace: NS, terms}, context: {mappings: []}}
  };
}

const person = {id: 'Person', iri: `${NS}Person`, kind: 'class',
  label: 'Person', comment: 'A human being.'};
const knows = {id: 'knows', iri: `${NS}knows`, kind: 'property', label: 'knows',
  comment: 'A Person this Person knows.',
  domain: [`${NS}Person`], range: [`${NS}Person`]};

// buildLabelSheets turns loaded cases into two flat CSVs a labeler edits in a
// spreadsheet: cases.csv (one row per case) and issues.csv (one row per
// subjective issue), plus a readable term reference. parseLabelSheets reads the
// filled CSVs back into validated per-case manifest labels. Both pure — no IO.
describe('eval: label sheets', () => {
  describe('buildLabelSheets', () => {
    it('emits a cases row per case with empty overall/designRank', () => {
      const {casesCsv} = buildLabelSheets(
        [caseWith('good', [person]), caseWith('did', [knows])], {});
      const rows = casesCsv.trim().split('\n');
      expect(rows[0]).to.equal('name,cohort,overall,designRank');
      expect(rows).to.have.lengthOf(3); // header + 2 cases
      expect(rows[1]).to.match(/^good,/);
      // case-level label cells start empty for the labeler to fill
      expect(rows[1]).to.equal('good,,,');
    });

    it('emits an empty issues sheet with just the header', () => {
      const {issuesCsv} = buildLabelSheets([caseWith('good', [person])], {});
      expect(issuesCsv.trim()).to.equal('case,term,category,note');
    });

    it('renders a term reference listing each term and its fields', () => {
      const {reference} = buildLabelSheets([caseWith('good', [knows])], {});
      expect(reference).to.contain('good');
      expect(reference).to.contain(`${NS}knows`);
      expect(reference).to.contain('A Person this Person knows.');
    });

    it('puts deterministic findings in the reference, not the sheets', () => {
      const {reference, issuesCsv} = buildLabelSheets(
        [caseWith('good', [knows])],
        {good: [{id: 'pair/coverage', message: 'knows not mapped'}]});
      expect(reference).to.contain('pair/coverage');
      // findings are context for the labeler, never pre-filled as issues
      expect(issuesCsv.trim()).to.equal('case,term,category,note');
    });
  });

  describe('parseLabelSheets', () => {
    it('parses case-level labels and joins issues by case', () => {
      const casesCsv = [
        'name,cohort,overall,designRank',
        'good,base,good,3',
        'did,w3c,bad,1'
      ].join('\n');
      const issuesCsv = [
        'case,term,category,note',
        `did,${NS}knows,naming,verb-phrase predicate`
      ].join('\n');
      const labels = parseLabelSheets({casesCsv, issuesCsv});
      expect(labels.good.overall).to.equal('good');
      expect(labels.good.designRank).to.equal(3);
      expect(labels.good.subjectiveIssues).to.deep.equal([]);
      expect(labels.did.subjectiveIssues).to.deep.equal([
        {term: `${NS}knows`, category: 'naming',
          note: 'verb-phrase predicate'}
      ]);
    });

    it('produces manifest-schema-valid label blocks', () => {
      const casesCsv = 'name,cohort,overall,designRank\ngood,base,borderline,0';
      const issuesCsv = 'case,term,category,note';
      const labels = parseLabelSheets({casesCsv, issuesCsv});
      // overall in the allowed band, designRank a non-negative int
      expect(labels.good.overall).to.equal('borderline');
      expect(labels.good.designRank).to.equal(0);
    });

    it('rejects an out-of-band overall value', () => {
      const casesCsv = 'name,cohort,overall,designRank\ngood,base,excellent,1';
      expect(() => parseLabelSheets({casesCsv, issuesCsv: 'case,term,' +
        'category,note'})).to.throw(/overall/);
    });

    it('rejects an issue category outside the rubric', () => {
      const casesCsv = 'name,cohort,overall,designRank\ngood,base,good,1';
      const issuesCsv = `case,term,category,note\ngood,${NS}x,bogus,n`;
      expect(() => parseLabelSheets({casesCsv, issuesCsv}))
        .to.throw(/category/);
    });

    it('leaves unset case labels null rather than guessing', () => {
      const casesCsv = 'name,cohort,overall,designRank\ngood,base,,';
      const labels = parseLabelSheets(
        {casesCsv, issuesCsv: 'case,term,category,note'});
      expect(labels.good.overall).to.equal(null);
      expect(labels.good.designRank).to.equal(null);
    });
  });
});
