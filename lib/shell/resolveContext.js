/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {createOfflineDocumentLoader} from './documentLoader.js';
import jsonld from 'jsonld';

// a namespace-prefix value names a namespace, so it ends in a delimiter
// (`#` or `/`) — e.g. `https://example.org/v#` or `http://schema.org/`. A value
// that does NOT end in a delimiter is a term value, not a prefix, even when it
// is a full absolute IRI: yml2vocab/DB contexts inline term values as full IRIs
// (`"Event": "http://schema.org/Event"`), and these must be treated as terms,
// not silently filed under prefixes and dropped from the model.

/**
 * Resolve a JSON-LD `@context` into the `mappings[]` the functional core
 * consumes: each context key paired with the absolute IRI it expands to, or
 * `null` when it cannot be resolved.
 *
 * Handles nested scoped contexts: `yml2vocab` and DB contexts commonly define a
 * class at the top level and its properties inside that class's scoped
 * `@context`. Terms are collected from every nesting level.
 *
 * Resolution uses jsonld.js's context processor (`jsonld.processContext`),
 * which builds the active context with the real JSON-LD semantics — prefix
 * expansion, `@id`, and `@type` coercion. Because `processContext` throws on
 * the whole context if any single term is invalid, each term is processed
 * against a SLIM context (the prefixes plus that one term) so a failure is
 * attributable to the specific term rather than poisoning the rest.
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
    const {iri, coercion} = await _resolveTerm(
      {prefixes, term, definition, loader});
    const mapping = {term, iri};
    if(coercion !== undefined) {
      mapping.coercion = coercion;
    }
    mappings.push(mapping);
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

// a namespace value ends in a `#`/`/` delimiter; a CURIE term value (`ex:name`)
// and a full-IRI term value (`http://schema.org/Event`) do not
function _isNamespace(value) {
  return value.endsWith('#') || value.endsWith('/');
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

// resolve one term against the context's prefixes via the jsonld active
// context, returning {iri, coercion}. The active context is built from the
// prefixes plus this single term, so a malformed sibling term elsewhere in the
// context cannot blind this one. Returns iri null (and no coercion) when the
// term cannot be processed even in isolation.
async function _resolveTerm({prefixes, term, definition, loader}) {
  const slim = {...prefixes, [term]: definition};
  let active;
  try {
    const base = await jsonld.processContext(
      null, null, {documentLoader: loader});
    active = await jsonld.processContext(base, slim, {documentLoader: loader});
  } catch {
    return {iri: null, coercion: undefined};
  }
  const entry = active.mappings.get(term);
  if(entry === undefined || typeof entry['@id'] !== 'string') {
    return {iri: null, coercion: undefined};
  }
  // jsonld has already expanded a CURIE/term @type to its absolute IRI and
  // leaves @id/@vocab as the keyword; pass the coercion through verbatim.
  const type = entry['@type'];
  const coercion = typeof type === 'string' ? type : undefined;
  return {iri: entry['@id'], coercion};
}
