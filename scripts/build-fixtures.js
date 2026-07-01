/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {dirname, join} from 'node:path';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Build the golden-set fixtures for the eval gate (SPEC sections 7, 9.1).
 *
 * For each case it generates real `yml2vocab` output from a YAML source, then —
 * for defects `yml2vocab` will not emit on its own — applies a small,
 * documented JSON mutation. The expected findings (the "oracle") are written
 * alongside, so the recall test derives expected results from the inputs rather
 * than hand-labeling them.
 *
 * `yml2vocab` is invoked via `npx` at build time only; it is not a project
 * dependency. The generated artifacts are committed so the test suite does not
 * need `yml2vocab` installed.
 *
 * Run with: `npm run build:fixtures`.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const SRC = join(ROOT, 'test', 'fixtures', 'golden', 'src');
const OUT = join(ROOT, 'test', 'fixtures', 'golden', 'generated');
const NS = 'https://example.org/v#';

// each case: a name, the YAML source to generate from, an optional mutation of
// the generated {vocab, context}, and the rule ids the analyzer must report.
// `expectedRuleIds` is the oracle. `[]` means "clean — no findings at all".
const CASES = [
  {
    name: 'good',
    src: 'good.yml',
    expectedRuleIds: []
  },
  {
    name: 'broken-no-definition',
    src: 'good.yml',
    // yml2vocab always synthesizes an rdfs:label (it defaults to the term id),
    // so a term with neither label nor comment cannot be produced from YAML.
    // Strip both from one term's node in the generated vocab.
    mutate({vocab, context}) {
      _stripDefinition(vocab, 'knows');
      return {vocab, context};
    },
    expectedRuleIds: ['vocab/no-definition']
  },
  {
    name: 'broken-uncovered',
    src: 'good.yml',
    // remove a term from the context so a vocab term is no longer covered
    mutate({vocab, context}) {
      _deleteContextTerm(context, 'knows');
      return {vocab, context};
    },
    expectedRuleIds: ['pair/coverage']
  },
  {
    name: 'broken-orphan',
    src: 'good.yml',
    // add a context mapping into the vocab namespace with no vocab term
    mutate({vocab, context}) {
      _addContextTerm(context, 'ghost', `${NS}ghost`);
      return {vocab, context};
    },
    expectedRuleIds: ['pair/orphan']
  },
  {
    name: 'broken-collision',
    src: 'good.yml',
    // point two distinct context terms at the same IRI
    mutate({vocab, context}) {
      _addContextTerm(context, 'fullName', `${NS}name`);
      return {vocab, context};
    },
    expectedRuleIds: ['ctx/iri-collision']
  },
  {
    name: 'broken-unresolved',
    src: 'good.yml',
    // give a context term a relative IRI that cannot resolve
    mutate({vocab, context}) {
      _addContextTerm(context, 'broken', 'notaprefix:butnoscheme that breaks');
      return {vocab, context};
    },
    expectedRuleIds: ['ctx/iri-unresolved']
  },
  {
    name: 'broken-unprotected',
    src: 'good.yml',
    // strip @protected everywhere so terms can be silently redefined
    mutate({vocab, context}) {
      _walkScopes(context['@context'], scope => delete scope['@protected']);
      return {vocab, context};
    },
    expectedRuleIds: ['ctx/unprotected']
  },
  {
    name: 'broken-unsafe-vocab',
    src: 'good.yml',
    // set a top-level @vocab that is not an absolute IRI
    mutate({vocab, context}) {
      context['@context']['@vocab'] = 'not-an-absolute-iri';
      return {vocab, context};
    },
    expectedRuleIds: ['ctx/unsafe-vocab']
  },
  {
    name: 'broken-hierarchy',
    src: 'good.yml',
    // point a term's rdfs:subClassOf at an undefined term in-namespace
    mutate({vocab, context}) {
      _setNodeField(vocab, 'Person', 'rdfs:subClassOf', 'ex:Missing');
      return {vocab, context};
    },
    expectedRuleIds: ['vocab/broken-hierarchy']
  },
  {
    name: 'broken-deprecated-mapped',
    src: 'good.yml',
    // mark a term deprecated while it remains mapped in the context
    mutate({vocab, context}) {
      _setNodeField(vocab, 'knows', 'owl:deprecated', true);
      return {vocab, context};
    },
    expectedRuleIds: ['vocab/deprecated-mapped']
  },
  {
    name: 'broken-missing-domain-range',
    src: 'good.yml',
    // remove both rdfs:domain and rdfs:range from a property
    mutate({vocab, context}) {
      _deleteNodeField(vocab, 'name', 'rdfs:domain');
      _deleteNodeField(vocab, 'name', 'rdfs:range');
      return {vocab, context};
    },
    expectedRuleIds: ['vocab/missing-domain-range']
  },
  {
    name: 'broken-missing-coercion',
    src: 'good.yml',
    // a property with an xsd:date range whose context mapping omits the
    // matching @type coercion
    mutate({vocab, context}) {
      _setNodeField(vocab, 'name', 'rdfs:range', 'xsd:date');
      _setContextCoercion(context, 'name', undefined);
      return {vocab, context};
    },
    expectedRuleIds: ['ctx/missing-coercion']
  },
  {
    name: 'broken-unstable-iri',
    src: 'good.yml',
    // give a term an IRI that embeds a version segment
    mutate({vocab, context}) {
      _addVocabTerm(vocab, 'https://example.org/v/v1/Widget');
      _addContextTerm(context, 'Widget', 'https://example.org/v/v1/Widget');
      return {vocab, context};
    },
    expectedRuleIds: ['vocab/unstable-iri']
  }
];

async function main() {
  await rm(OUT, {recursive: true, force: true});
  await mkdir(OUT, {recursive: true});

  const manifest = [];
  for(const testCase of CASES) {
    const generated = await _generate(testCase.src);
    let {vocab, context} = generated;
    if(testCase.mutate) {
      ({vocab, context} = testCase.mutate({vocab, context}));
    }
    const base = join(OUT, testCase.name);
    await writeFile(`${base}.jsonld`, JSON.stringify(vocab, null, 2));
    await writeFile(`${base}.context.jsonld`, JSON.stringify(context, null, 2));
    manifest.push({
      name: testCase.name,
      vocab: `${testCase.name}.jsonld`,
      context: `${testCase.name}.context.jsonld`,
      expectedRuleIds: testCase.expectedRuleIds
    });
    console.log(`built ${testCase.name} ` +
      `(expects: ${testCase.expectedRuleIds.join(', ') || 'clean'})`);
  }

  await writeFile(
    join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nwrote manifest with ${manifest.length} cases to ${OUT}`);
}

// run yml2vocab on a YAML source in a temp dir and return the generated
// {vocab, context} as parsed JSON
async function _generate(srcYaml) {
  const work = join(OUT, '.work');
  await mkdir(work, {recursive: true});
  const yaml = await readFile(join(SRC, srcYaml), 'utf8');
  const template = await readFile(join(SRC, 'template.html'), 'utf8');
  await writeFile(join(work, 'vocabulary.yml'), yaml);
  await writeFile(join(work, 'template.html'), template);

  await execFileAsync(
    'npx', ['--yes', 'yml2vocab@1.9.3', '-v', 'vocabulary.yml', '-c'],
    {cwd: work});

  const vocab = JSON.parse(
    await readFile(join(work, 'vocabulary.jsonld'), 'utf8'));
  const context = JSON.parse(
    await readFile(join(work, 'vocabulary.context.jsonld'), 'utf8'));
  await rm(work, {recursive: true, force: true});
  return {vocab, context};
}

// --- mutation helpers: operate on the generated context, which uses nested
// scoped contexts (properties live inside their class's @context) ---

function _addContextTerm(context, term, iri) {
  const scope = _firstScope(context['@context']);
  scope[term] = {'@id': iri};
}

// set or overwrite an rdfs:* / owl:* field on the vocab term node whose @id
// ends in the given local name.
function _setNodeField(vocab, localName, field, value) {
  const node = _findNode(vocab, localName);
  node[field] = value;
}

// remove a field from the vocab term node whose @id ends in the given local
// name; throws if the field is absent so a stale mutation is caught.
function _deleteNodeField(vocab, localName, field) {
  const node = _findNode(vocab, localName);
  if(!(field in node)) {
    throw new Error(
      `_deleteNodeField: "${field}" not found on "${localName}"`);
  }
  delete node[field];
}

function _findNode(vocab, localName) {
  let found;
  _walkNodes(vocab, node => {
    if(_hasLocalName(node['@id'], localName)) {
      found = node;
    }
  });
  if(found === undefined) {
    throw new Error(`_findNode: no term node for "${localName}"`);
  }
  return found;
}

// append a minimal class term node (with an absolute @id) into the vocab's
// class list, so a term with an arbitrary IRI can be introduced.
function _addVocabTerm(vocab, iri) {
  const label = iri.split(/[#/]/).pop();
  const node = {'@id': iri, '@type': 'rdfs:Class', 'rdfs:label': label};
  if(Array.isArray(vocab.rdfs_classes)) {
    vocab.rdfs_classes.push(node);
  } else if(vocab.rdfs_classes !== undefined) {
    vocab.rdfs_classes = [vocab.rdfs_classes, node];
  } else {
    vocab.rdfs_classes = node;
  }
}

// drop the @type coercion from a term's context mapping, leaving a bare @id
// mapping (value undefined removes the coercion entirely).
function _setContextCoercion(context, term, coercion) {
  _walkScopes(context['@context'], scope => {
    const def = scope[term];
    if(def !== null && typeof def === 'object' && '@id' in def) {
      if(coercion === undefined) {
        delete def['@type'];
      } else {
        def['@type'] = coercion;
      }
    }
  });
}

function _deleteContextTerm(context, term) {
  _walkScopes(context['@context'], scope => {
    if(term in scope) {
      delete scope[term];
    }
  });
}

// the first nested class scope, where adding a property-like term is realistic
function _firstScope(ctx) {
  for(const value of Object.values(ctx)) {
    if(value !== null && typeof value === 'object' && '@context' in value) {
      return value['@context'];
    }
  }
  // no nested scope; fall back to the top-level context
  return ctx;
}

function _walkScopes(ctx, visit) {
  if(ctx === null || typeof ctx !== 'object') {
    return;
  }
  visit(ctx);
  for(const value of Object.values(ctx)) {
    if(value !== null && typeof value === 'object' && '@context' in value) {
      _walkScopes(value['@context'], visit);
    }
  }
}

// remove the label and comment from the term node whose @id ends in the given
// local name, wherever it sits in the generated vocab (yml2vocab nests term
// nodes under reverse-link keys, not a flat @graph, and uses CURIE @ids like
// "ex:knows"). The node keeps its @id and @type so it is still a term — just an
// undefined one.
function _stripDefinition(vocab, localName) {
  let stripped = 0;
  _walkNodes(vocab, node => {
    if(_hasLocalName(node['@id'], localName)) {
      for(const key of Object.keys(node)) {
        if(key.includes('label') || key.includes('comment')) {
          delete node[key];
          stripped++;
        }
      }
    }
  });
  if(stripped === 0) {
    throw new Error(
      `_stripDefinition: no label/comment found for "${localName}"`);
  }
}

function _hasLocalName(id, localName) {
  if(typeof id !== 'string') {
    return false;
  }
  return id === localName ||
    id.endsWith(`#${localName}`) || id.endsWith(`:${localName}`) ||
    id.endsWith(`/${localName}`);
}

function _walkNodes(value, visit) {
  if(Array.isArray(value)) {
    for(const item of value) {
      _walkNodes(item, visit);
    }
    return;
  }
  if(value === null || typeof value !== 'object') {
    return;
  }
  if('@id' in value) {
    visit(value);
  }
  for(const v of Object.values(value)) {
    _walkNodes(v, visit);
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
