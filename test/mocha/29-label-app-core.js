/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {
  blindKit, buildKit, checkRequest, makeBlinding, unblindLabels
} from '../../lib/eval/labelAppCore.js';
import {expect} from 'chai';

describe('labelAppCore', () => {
  describe('buildKit', () => {
    const cases = [{
      name: 'good',
      model: {
        vocab: {
          terms: [{
            id: 'Person', iri: 'https://example.org/v#Person', kind: 'class',
            label: 'Person', comment: 'A human being.'
          }, {
            id: 'knows', iri: 'https://example.org/v#knows', kind: 'property',
            domain: ['https://example.org/v#Person'],
            range: ['https://example.org/v#Person']
          }]
        }
      }
    }, {
      name: 'anchor', model: {vocab: {terms: []}}
    }];
    const findingsByCase = {
      good: [{
        id: 'vocab/no-definition', severity: 'warning',
        message: 'no definition', term: 'x', remediation: 'add one'
      }],
      anchor: []
    };
    const cohorts = {good: 'generated', anchor: 'anchors'};

    it('flattens terms to plain iri/kind/label/comment/domain/range', () => {
      const kit = buildKit({cases, findingsByCase, cohorts, labels: {}});
      const [person, knows] = kit.cases[0].terms;
      expect(person).to.deep.equal({
        iri: 'https://example.org/v#Person', kind: 'class',
        label: 'Person', comment: 'A human being.'
      });
      expect(knows).to.deep.equal({
        iri: 'https://example.org/v#knows', kind: 'property',
        domain: ['https://example.org/v#Person'],
        range: ['https://example.org/v#Person']
      });
    });

    it('strips markup from labels and comments (yml2vocab wraps them in ' +
      'divs)', () => {
      const divCases = [{
        name: 'good',
        model: {vocab: {terms: [{
          id: 'attendees', iri: 'https://example.org/v#attendees',
          kind: 'property', label: '<em>attendees</em>',
          comment: '<div>How many attendees the <b>Event</b> has.</div>'
        }]}}
      }];
      const kit = buildKit({cases: divCases, findingsByCase: {},
        cohorts: {good: 'generated'}, labels: {}});
      expect(kit.cases[0].terms[0].label).to.equal('attendees');
      expect(kit.cases[0].terms[0].comment)
        .to.equal('How many attendees the Event has.');
    });

    it('omits absent term fields', () => {
      const kit = buildKit({cases, findingsByCase, cohorts, labels: {}});
      expect(kit.cases[0].terms[1]).to.not.have.property('label');
      expect(kit.cases[0].terms[1]).to.not.have.property('comment');
      expect(kit.cases[0].terms[0]).to.not.have.property('domain');
    });

    it('maps findings to {id, message} only', () => {
      const kit = buildKit({cases, findingsByCase, cohorts, labels: {}});
      expect(kit.cases[0].findings).to.deep.equal(
        [{id: 'vocab/no-definition', message: 'no definition'}]);
      expect(kit.cases[1].findings).to.deep.equal([]);
    });

    it('attaches cohort from the cohorts map', () => {
      const kit = buildKit({cases, findingsByCase, cohorts, labels: {}});
      expect(kit.cases[0].cohort).to.equal('generated');
      expect(kit.cases[1].cohort).to.equal('anchors');
    });

    it('attaches raw source documents when provided', () => {
      const sourceByCase = {
        good: {vocab: {'@graph': []}, context: {'@context': {}}},
        anchor: {context: {'@context': {}}}
      };
      const kit = buildKit(
        {cases, findingsByCase, cohorts, labels: {}, sourceByCase});
      expect(kit.cases[0].source).to.deep.equal(sourceByCase.good);
      // context-only anchors have no vocab document
      expect(kit.cases[1].source).to.deep.equal(sourceByCase.anchor);
    });

    it('omits source when none is provided', () => {
      const kit = buildKit({cases, findingsByCase, cohorts, labels: {}});
      expect(kit.cases[0]).to.not.have.property('source');
    });

    it('passes labels through unchanged', () => {
      const labels = {good: {overall: 'good', designRank: 1,
        subjectiveIssues: []}};
      const kit = buildKit({cases, findingsByCase, cohorts, labels});
      expect(kit.labels).to.deep.equal(labels);
    });

    it('passes an empty labels map through', () => {
      const kit = buildKit({cases, findingsByCase, cohorts, labels: {}});
      expect(kit.labels).to.deep.equal({});
    });

    it('throws when a case name is missing from the cohorts map', () => {
      expect(() => buildKit({
        cases, findingsByCase, cohorts: {good: 'generated'}, labels: {}
      })).to.throw(/anchor/);
    });
  });

  describe('checkRequest', () => {
    const base = {method: 'GET', path: '/api/kit', port: 8642};

    it('allows Host 127.0.0.1 with the port', () => {
      const r = checkRequest({...base, host: '127.0.0.1:8642'});
      expect(r.allowed).to.equal(true);
    });

    it('allows Host localhost with the port', () => {
      const r = checkRequest({...base, host: 'localhost:8642'});
      expect(r.allowed).to.equal(true);
    });

    it('allows Host without a port', () => {
      expect(checkRequest({...base, host: '127.0.0.1'}).allowed)
        .to.equal(true);
      expect(checkRequest({...base, host: 'localhost'}).allowed)
        .to.equal(true);
    });

    it('rejects an evil Host with 403', () => {
      const r = checkRequest({...base, host: 'evil.example'});
      expect(r.allowed).to.equal(false);
      expect(r.status).to.equal(403);
    });

    it('rejects an evil Origin with 403', () => {
      const r = checkRequest({
        ...base, host: '127.0.0.1:8642', origin: 'http://evil.example'});
      expect(r.allowed).to.equal(false);
      expect(r.status).to.equal(403);
    });

    it('allows a matching Origin', () => {
      const r = checkRequest({
        ...base, host: '127.0.0.1:8642',
        origin: 'http://127.0.0.1:8642'});
      expect(r.allowed).to.equal(true);
    });

    it('allows an absent Origin', () => {
      const r = checkRequest({...base, host: 'localhost:8642'});
      expect(r.allowed).to.equal(true);
    });

    it('404s an unknown path', () => {
      const r = checkRequest({
        method: 'GET', path: '/nope', host: '127.0.0.1:8642', port: 8642});
      expect(r.allowed).to.equal(false);
      expect(r.status).to.equal(404);
    });

    it('405s a POST to /api/labels', () => {
      const r = checkRequest({
        method: 'POST', path: '/api/labels', host: '127.0.0.1:8642',
        port: 8642});
      expect(r.allowed).to.equal(false);
      expect(r.status).to.equal(405);
    });

    it('allows the known routes', () => {
      const host = '127.0.0.1:8642';
      expect(checkRequest({method: 'GET', path: '/', host, port: 8642})
        .allowed).to.equal(true);
      expect(checkRequest({method: 'PUT', path: '/api/labels', host,
        port: 8642}).allowed).to.equal(true);
    });
  });

  // blinding: the UI must never see fixture names like "broken-orphan" —
  // they leak the expected verdict and bias the expert labels
  describe('makeBlinding', () => {
    const names = ['good', 'broken-orphan', 'anchor-x'];

    it('maps every name to a distinct padded pseudonym, both ways', () => {
      const {toBlind, toReal} = makeBlinding(names);
      expect(Object.keys(toBlind)).to.have.lengthOf(3);
      for(const name of names) {
        expect(toBlind[name]).to.match(/^case-\d$/);
        expect(toReal[toBlind[name]]).to.equal(name);
      }
      expect(new Set(Object.values(toBlind)).size).to.equal(3);
    });

    it('is stable across calls regardless of input order', () => {
      const a = makeBlinding(names);
      const b = makeBlinding([...names].reverse());
      expect(a.toBlind).to.deep.equal(b.toBlind);
    });

    it('does not assign pseudonyms in input order', () => {
      // 27 names in sorted order must not come out as case-01..case-27 in
      // that same order — position would then leak manifest order
      const many = Array.from({length: 27}, (_, i) =>
        `name-${String(i).padStart(2, '0')}`);
      const {toBlind} = makeBlinding(many);
      const positions = many.map(n => toBlind[n]);
      expect(positions).to.not.deep.equal([...positions].sort());
    });

    it('honors a custom prefix', () => {
      const {toBlind} = makeBlinding(['generated', 'anchors'],
        {prefix: 'cohort'});
      expect(Object.values(toBlind).every(p => p.startsWith('cohort-')))
        .to.equal(true);
    });
  });

  describe('blindKit / unblindLabels', () => {
    const kit = {
      cases: [
        {name: 'good', cohort: 'generated', terms: [], findings: []},
        {name: 'anchor-x', cohort: 'anchors', terms: [], findings: []}
      ],
      labels: {good: {overall: 'good', designRank: 1, subjectiveIssues: []}}
    };
    const caseB = makeBlinding(['good', 'anchor-x']);
    const cohortB = makeBlinding(['generated', 'anchors'],
      {prefix: 'cohort'});

    it('replaces case and cohort names and rekeys labels', () => {
      const blinded = blindKit(kit, caseB, cohortB);
      for(const c of blinded.cases) {
        expect(c.name).to.match(/^case-\d$/);
        expect(c.cohort).to.match(/^cohort-\d$/);
      }
      expect(blinded.labels[caseB.toBlind.good].overall).to.equal('good');
      expect(blinded.labels.good).to.equal(undefined);
      // input untouched
      expect(kit.cases[0].name).to.equal('good');
    });

    it('orders blinded cases by pseudonym, not input order', () => {
      const blinded = blindKit(kit, caseB, cohortB);
      const names = blinded.cases.map(c => c.name);
      expect(names).to.deep.equal([...names].sort());
    });

    it('throws when a saved label names an unknown case', () => {
      const bad = {...kit, labels: {mystery: {overall: 'good',
        designRank: null, subjectiveIssues: []}}};
      expect(() => blindKit(bad, caseB, cohortB)).to.throw(/mystery/);
    });

    it('unblinds label keys back to real names, round-trip', () => {
      const blinded = blindKit(kit, caseB, cohortB);
      expect(unblindLabels(blinded.labels, caseB)).to.deep.equal(kit.labels);
    });

    it('unblindLabels throws on an unknown pseudonym', () => {
      expect(() => unblindLabels({'case-99': {}}, caseB))
        .to.throw(/case-99/);
    });
  });
});
