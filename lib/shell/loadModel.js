/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {createOfflineDocumentLoader} from './documentLoader.js';
import jsonld from 'jsonld';
import {resolveContext} from './resolveContext.js';

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDFS_LABEL = `${RDFS}label`;
const RDFS_COMMENT = `${RDFS}comment`;

// node @types that mark an RDF node as a vocabulary term (class, property, or
// datatype). nodes without one of these — e.g. the owl:Ontology node, or a
// jsonld Context node — are not terms and are excluded.
const TERM_TYPES = new Set([
  `${RDFS}Class`, `${RDFS}Datatype`,
  `${RDF}Property`,
  `${OWL}Class`, `${OWL}DatatypeProperty`, `${OWL}ObjectProperty`,
  `${OWL}DeprecatedClass`, `${OWL}DeprecatedProperty`
]);

/**
 * Build the functional core's resolved model from a JSON-LD vocabulary document
 * and a JSON-LD `@context` document (SPEC section 6, imperative shell). This is
 * the IO/parse boundary; the returned model is a plain object the pure core
 * consumes.
 *
 * Offline by default: external IRIs are not fetched unless a network-capable
 * `documentLoader` is supplied.
 *
 * @param {object} options - Options.
 * @param {object} options.vocab - The JSON-LD vocabulary document.
 * @param {object} options.context - The JSON-LD `@context` document.
 * @param {Function} [options.documentLoader] - A jsonld document loader; an
 *   offline loader is used when omitted.
 *
 * @returns {Promise<object>} The resolved {@link module:model~Model}.
 */
export async function loadModel({vocab, context, documentLoader} = {}) {
  const loader = documentLoader ?? createOfflineDocumentLoader();
  const terms = await _extractTerms(vocab, loader);
  const {mappings} = await resolveContext(context, {documentLoader: loader});
  return {
    vocab: {namespace: _inferNamespace(terms), terms},
    context: {mappings, raw: _unwrapContext(context)}
  };
}

async function _extractTerms(vocab, loader) {
  // flatten pulls every node into a single flat list regardless of how the
  // source nested them (yml2vocab nests terms under the ontology node via
  // reverse rdfs:isDefinedBy links); flattening normalizes that away
  const flattened = await jsonld.flatten(vocab, null, {documentLoader: loader});
  const nodes = Array.isArray(flattened) ?
    flattened : (flattened['@graph'] ?? []);

  const terms = [];
  for(const node of nodes) {
    const iri = node['@id'];
    if(typeof iri !== 'string' || iri.startsWith('_:')) {
      // skip blank nodes and nodes without an id
      continue;
    }
    if(!_isTerm(node)) {
      // skip non-term nodes (ontology metadata, context nodes, etc.)
      continue;
    }
    const term = {id: _localName(iri), iri};
    const label = _firstValue(node[RDFS_LABEL]);
    const comment = _firstValue(node[RDFS_COMMENT]);
    if(label !== undefined) {
      term.label = label;
    }
    if(comment !== undefined) {
      term.comment = comment;
    }
    terms.push(term);
  }
  return terms;
}

function _isTerm(node) {
  const types = node['@type'];
  if(!Array.isArray(types)) {
    return false;
  }
  return types.some(type => TERM_TYPES.has(type));
}

function _firstValue(values) {
  if(!Array.isArray(values) || values.length === 0) {
    return undefined;
  }
  return values[0]['@value'];
}

function _localName(iri) {
  const hash = iri.lastIndexOf('#');
  const slash = iri.lastIndexOf('/');
  const cut = Math.max(hash, slash);
  return cut === -1 ? iri : iri.slice(cut + 1);
}

// the namespace is the term IRIs' shared prefix up to and including the final
// delimiter (`#` or `/`); when terms disagree, there is no single namespace
function _inferNamespace(terms) {
  const namespaces = new Set();
  for(const {iri} of terms) {
    const hash = iri.lastIndexOf('#');
    const slash = iri.lastIndexOf('/');
    const cut = Math.max(hash, slash);
    if(cut !== -1) {
      namespaces.add(iri.slice(0, cut + 1));
    }
  }
  return namespaces.size === 1 ? [...namespaces][0] : undefined;
}

function _unwrapContext(context) {
  if(context && typeof context === 'object' && '@context' in context) {
    return context['@context'];
  }
  return context;
}
