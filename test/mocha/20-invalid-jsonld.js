/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {loadModel} from '../../lib/shell/loadModel.js';
import {runRules} from '../../lib/runRules.js';

const NS = 'https://example.org/v#';

const GOOD_VOCAB = {
  '@context': {rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#', ex: NS},
  '@graph': [{'@id': 'ex:name', '@type': 'rdf:Property', 'rdfs:label': 'N'}]
};

describe('shell: ctx/invalid-jsonld smoke test', () => {
  it('adds no finding for a context that processes cleanly', async () => {
    const context = {'@context': {ex: NS, name: 'ex:name'}};
    const model = await loadModel({vocab: GOOD_VOCAB, context});
    const ids = runRules(model).map(f => f.id);
    expect(ids).to.not.include('ctx/invalid-jsonld');
  });

  it('flags a context that fails JSON-LD processing', async () => {
    // an invalid term definition: @id mapped to a non-string/object jsonld
    // rejects this during context processing
    const context = {'@context': {ex: NS, bad: {'@id': 42}}};
    const model = await loadModel({vocab: GOOD_VOCAB, context});
    const finding = runRules(model).find(f => f.id === 'ctx/invalid-jsonld');
    expect(finding, 'expected a ctx/invalid-jsonld finding').to.exist;
    expect(finding).to.include({severity: 'error', artifact: 'context'});
  });

  it('exposes the smoke-test result through the model', async () => {
    const context = {'@context': {ex: NS, name: 'ex:name'}};
    const model = await loadModel({vocab: GOOD_VOCAB, context});
    // the shell attaches any pre-computed findings; clean context -> none
    expect(model.preFindings ?? []).to.deep.equal([]);
  });
});
