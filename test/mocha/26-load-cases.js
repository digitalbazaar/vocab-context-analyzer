/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {expect} from 'chai';
import {loadCases} from '../../lib/eval/loadCases.js';

const NS = 'https://example.org/v#';

// a fake document reader: maps a relative path to an in-memory JSON-LD doc, so
// loadCases can be tested without touching disk
function reader(docs) {
  return async path => {
    if(!(path in docs)) {
      throw new Error(`no such doc: ${path}`);
    }
    return docs[path];
  };
}

const vocabDoc = {
  '@context': {ex: NS, rdfs: 'http://www.w3.org/2000/01/rdf-schema#'},
  '@graph': [{'@id': 'ex:Person', '@type': 'rdfs:Class', 'rdfs:label': 'P'}]
};
const contextDoc = {'@context': {ex: NS, Person: 'ex:Person'}};

// loadCases turns manifest entries into eval-ready cases (the shared loader for
// the generated golden set and the real-context anchors, PLAN-eval-runner
// follow-ups). It validates each entry, resolves vocab/context via an injected
// reader, and builds the model — vocab is optional (context-only cases).
describe('eval: loadCases (shared manifest loader)', () => {
  it('builds a case with vocab and context', async () => {
    const read = reader({'v.jsonld': vocabDoc, 'v.context.jsonld': contextDoc});
    const cases = await loadCases({
      entries: [{name: 'good', vocab: 'v.jsonld', context: 'v.context.jsonld',
        expectedRuleIds: []}],
      readJson: read
    });
    expect(cases).to.have.lengthOf(1);
    expect(cases[0].name).to.equal('good');
    expect(cases[0].model.vocab.terms.length).to.be.above(0);
    expect(cases[0].expectedRuleIds).to.deep.equal([]);
    expect(cases[0].exact).to.equal(false);
  });

  it('builds a context-only case when vocab is omitted', async () => {
    const read = reader({'v.context.jsonld': contextDoc});
    const cases = await loadCases({
      entries: [{name: 'anchor', context: 'v.context.jsonld',
        expectedRuleIds: []}],
      readJson: read
    });
    expect(cases[0].model.vocab.terms).to.deep.equal([]);
  });

  it('passes through exact for regression anchors', async () => {
    const read = reader({'v.context.jsonld': contextDoc});
    const cases = await loadCases({
      entries: [{name: 'reg', context: 'v.context.jsonld',
        expectedRuleIds: ['ctx/unprotected'], exact: true}],
      readJson: read
    });
    expect(cases[0].exact).to.equal(true);
    expect(cases[0].expectedRuleIds).to.deep.equal(['ctx/unprotected']);
  });

  it('validates each entry and rejects a malformed one', async () => {
    const read = reader({'v.context.jsonld': contextDoc});
    // missing required `context`
    let threw = false;
    try {
      await loadCases({entries: [{name: 'bad'}], readJson: read});
    } catch(e) {
      threw = true;
      expect(e.message).to.match(/context/);
    }
    expect(threw, 'should throw on a malformed entry').to.equal(true);
  });
});
