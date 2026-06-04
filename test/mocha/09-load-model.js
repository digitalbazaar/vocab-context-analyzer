/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {loadModel} from '../../lib/shell/loadModel.js';

// a minimal expanded-friendly JSON-LD vocabulary, yml2vocab-shaped
const VOCAB = {
  '@context': {
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    owl: 'http://www.w3.org/2002/07/owl#',
    ex: 'https://example.org/v#'
  },
  '@graph': [
    {
      '@id': 'ex:name',
      '@type': 'rdf:Property',
      'rdfs:label': 'Name',
      'rdfs:comment': 'The name of a thing.'
    },
    {
      '@id': 'ex:age',
      '@type': 'rdf:Property',
      'rdfs:label': 'Age'
    }
  ]
};

const CONTEXT = {
  '@context': {
    ex: 'https://example.org/v#',
    name: 'ex:name',
    age: 'ex:age'
  }
};

describe('shell: loadModel', () => {
  it('builds a model with vocab terms and context mappings', async () => {
    const model = await loadModel({vocab: VOCAB, context: CONTEXT});
    expect(model).to.have.nested.property('vocab.terms');
    expect(model).to.have.nested.property('context.mappings');
  });

  it('extracts each vocab term id, iri, label and comment', async () => {
    const {vocab} = await loadModel({vocab: VOCAB, context: CONTEXT});
    const byIri = Object.fromEntries(vocab.terms.map(t => [t.iri, t]));
    expect(byIri['https://example.org/v#name']).to.include({
      iri: 'https://example.org/v#name',
      label: 'Name',
      comment: 'The name of a thing.'
    });
    expect(byIri['https://example.org/v#age'].label).to.equal('Age');
    expect(byIri['https://example.org/v#age'].comment).to.equal(undefined);
  });

  it('resolves context mappings to absolute IRIs', async () => {
    const {context} = await loadModel({vocab: VOCAB, context: CONTEXT});
    expect(context.mappings).to.deep.include.members([
      {term: 'name', iri: 'https://example.org/v#name'},
      {term: 'age', iri: 'https://example.org/v#age'}
    ]);
  });

  it('infers the vocab namespace as the common term-IRI prefix', async () => {
    const {vocab} = await loadModel({vocab: VOCAB, context: CONTEXT});
    expect(vocab.namespace).to.equal('https://example.org/v#');
  });

  it('produces a model the core accepts end to end', async () => {
    const {runRules} = await import('../../lib/runRules.js');
    const model = await loadModel({vocab: VOCAB, context: CONTEXT});
    const findings = runRules(model);
    // clean fixture: no errors expected
    expect(findings.filter(f => f.severity === 'error')).to.deep.equal([]);
  });

  it('surfaces a seeded defect end to end (orphan mapping)', async () => {
    const {runRules} = await import('../../lib/runRules.js');
    const brokenContext = {
      '@context': {
        ex: 'https://example.org/v#',
        name: 'ex:name',
        ghost: 'ex:ghost' // maps into vocab namespace, no such term
      }
    };
    const model = await loadModel({vocab: VOCAB, context: brokenContext});
    const ids = runRules(model).map(f => f.id);
    expect(ids).to.include('pair/orphan');
  });
});
