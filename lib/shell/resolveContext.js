/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {createOfflineDocumentLoader} from './documentLoader.js';
import jsonld from 'jsonld';

// a namespace-prefix value is an absolute IRI that names a namespace: it has a
// scheme with an authority (`scheme://...`) or ends in a delimiter (`#` or `/`).
// this distinguishes a prefix value (`https://example.org/v#`) from a CURIE
// term value (`ex:name`), which has neither.
const NAMESPACE_IRI = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Resolve a JSON-LD `@context` into the `mappings[]` the functional core
 * consumes: each context key paired with the absolute IRI it expands to, or
 * `null` when it cannot be resolved.
 *
 * Handles nested scoped contexts: `yml2vocab` and DB contexts commonly define a
 * class at the top level and its properties inside that class's scoped
 * `@context`. Terms are collected from every nesting level.
 *
 * Resolution uses jsonld.js with the real JSON-LD term-expansion semantics
 * (prefixes, `@id`, nested term definitions). Because `jsonld.expand` throws on
 * the whole context if any single term is invalid, each term is expanded
 * against a SLIM context (the prefix entries plus that one term) so a failure
 * is attributable to the specific term rather than poisoning the rest.
 *
 * @param {object} contextDocument - A context document (`{'@context': {...}}`)
 *   or a bare context object.
 * @param {object} [options] - Options.
 * @param {Function} [options.documentLoader] - A jsonld document loader. When
 *   omitted, an offline (deny-by-default, no network) loader is used.
 *
 * @returns {Promise<{mappings: object[]}>} The resolved mappings.
 */
export async function resolveContext(contextDocument, {documentLoader} = {}) {
  const context = _unwrap(contextDocument);
  const loader = documentLoader ?? createOfflineDocumentLoader();
  const prefixes = {};
  const terms = [];
  _collect(context, prefixes, terms, new Set());

  const mappings = [];
  for(const {term, definition} of terms) {
    const iri = await _resolveTerm({prefixes, term, definition, loader});
    mappings.push({term, iri});
  }
  return {mappings};
}

function _unwrap(contextDocument) {
  if(contextDocument && typeof contextDocument === 'object' &&
    '@context' in contextDocument) {
    return contextDocument['@context'];
  }
  return contextDocument;
}

// recursively collect prefix entries and term definitions from a context and
// any nested scoped `@context` objects. prefixes accumulate across levels;
// terms keep their own definition for resolution. `seen` dedups terms so a key
// appearing in multiple scopes is only mapped once.
function _collect(context, prefixes, terms, seen) {
  if(context === null || typeof context !== 'object') {
    return;
  }
  for(const [key, value] of Object.entries(context)) {
    if(key.startsWith('@')) {
      continue;
    }
    if(typeof value === 'string' && _isNamespace(value)) {
      prefixes[key] = value;
      continue;
    }
    if(_isKeywordAlias(value)) {
      // e.g. "id": "@id", "type": "@type" — a JSON-LD keyword alias, not a
      // vocabulary term; never a finding
      continue;
    }
    if(!seen.has(key)) {
      seen.add(key);
      terms.push({term: key, definition: value});
    }
    // a term definition may carry a nested scoped @context with more terms
    if(value !== null && typeof value === 'object' && '@context' in value) {
      _collect(value['@context'], prefixes, terms, seen);
    }
  }
}

// a namespace value either has an authority (`scheme://`) or ends in a `#`/`/`
// delimiter; a CURIE term value (`ex:name`) has neither
function _isNamespace(value) {
  return NAMESPACE_IRI.test(value) ||
    value.endsWith('#') || value.endsWith('/');
}

// a keyword alias maps a key onto a JSON-LD keyword, either directly
// (`"id": "@id"`) or via `@id` in an expanded definition (`{"@id": "@type"}`)
function _isKeywordAlias(value) {
  if(typeof value === 'string') {
    return value.startsWith('@');
  }
  if(value !== null && typeof value === 'object') {
    return typeof value['@id'] === 'string' && value['@id'].startsWith('@');
  }
  return false;
}

async function _resolveTerm({prefixes, term, definition, loader}) {
  const slim = {...prefixes, [term]: definition};
  try {
    const expanded = await jsonld.expand(
      {'@context': slim, [term]: 'x'}, {documentLoader: loader});
    if(expanded.length === 0) {
      // the term was dropped during expansion (no mapping)
      return null;
    }
    const iri = Object.keys(expanded[0]).find(key => key !== '@id');
    return iri ?? null;
  } catch {
    // an invalid/unresolvable term throws; treat as unresolved
    return null;
  }
}
