/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {buildLabelPacket} from '../../lib/eval/labelPacket.js';
import {expect} from 'chai';

const NS = 'https://example.org/v#';

function model() {
  return {
    vocab: {
      namespace: NS,
      terms: [
        {id: 'Person', iri: `${NS}Person`, kind: 'class',
          label: 'Person', comment: 'A human being.'},
        {id: 'knows', iri: `${NS}knows`, kind: 'property', label: 'knows',
          comment: 'A Person this Person knows.',
          domain: [`${NS}Person`], range: [`${NS}Person`]}
      ]
    },
    context: {mappings: []}
  };
}

// buildLabelPacket turns a loaded case + its deterministic findings into a
// human-labeling packet: a readable term rendering, the findings the rules
// already caught (so the labeler doesn't re-flag them), and an empty
// subjectiveIssues stub matching the manifest schema. Pure — no IO.
describe('eval: buildLabelPacket', () => {
  it('lists every term with kind, label, comment, and domain/range', () => {
    const packet = buildLabelPacket({name: 'good', model: model()},
      [{id: 'pair/coverage', message: 'x'}]);
    expect(packet.name).to.equal('good');
    expect(packet.terms).to.have.lengthOf(2);
    const knows = packet.terms.find(t => t.iri === `${NS}knows`);
    expect(knows.kind).to.equal('property');
    expect(knows.comment).to.equal('A Person this Person knows.');
    expect(knows.domain).to.deep.equal([`${NS}Person`]);
  });

  it('includes the deterministic findings already caught', () => {
    const packet = buildLabelPacket({name: 'good', model: model()},
      [{id: 'pair/coverage', message: 'term X not mapped'}]);
    expect(packet.deterministicFindings).to.deep.equal(
      [{id: 'pair/coverage', message: 'term X not mapped'}]);
  });

  it('provides empty label fields and a subjectiveIssues stub', () => {
    const packet = buildLabelPacket({name: 'good', model: model()}, []);
    expect(packet.labels).to.have.property('overall', null);
    expect(packet.labels).to.have.property('designRank', null);
    expect(packet.labels.subjectiveIssues).to.deep.equal([]);
  });

  it('renders a missing comment as null, to focus definition review', () => {
    const m = model();
    delete m.vocab.terms[1].comment;
    const packet = buildLabelPacket({name: 'good', model: m}, []);
    const knows = packet.terms.find(t => t.iri === `${NS}knows`);
    expect(knows.comment).to.equal(null);
  });
});
