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
    const iri = await _resolveTerm({prefixes, definition, loader});
    const mapping = {term, iri};
    const coercion = await _coercion(definition, prefixes, loader);
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

async function _resolveTerm({prefixes, definition, loader}) {
  // when the definition carries an explicit @id, resolve that directly. probing
  // with a placeholder value is unreliable for terms with @container (e.g.
  // @container: @graph drops a plain string value, yielding a false negative),
  // and the @id is the authoritative mapping anyway.
  const explicitId = _explicitId(definition);
  if(explicitId !== undefined) {
    return _expandIri(explicitId, prefixes, loader);
  }
  // bare string value (a CURIE or IRI): probe via expansion so prefixes apply
  return _expandIri(definition, prefixes, loader);
}

function _explicitId(definition) {
  if(definition !== null && typeof definition === 'object' &&
    typeof definition['@id'] === 'string') {
    return definition['@id'];
  }
  return undefined;
}

// the `@type` coercion declared for a term, normalized to an absolute IRI (for
// datatype coercions) or the keyword `@id`/`@vocab` (for node references), or
// `undefined` when the term declares no coercion. a bare string definition (a
// plain CURIE/IRI value) carries no coercion.
async function _coercion(definition, prefixes, loader) {
  if(definition === null || typeof definition !== 'object') {
    return undefined;
  }
  const type = definition['@type'];
  if(typeof type !== 'string') {
    return undefined;
  }
  if(type === '@id' || type === '@vocab') {
    return type;
  }
  // a datatype IRI/CURIE — expand it so callers can compare absolute IRIs
  return _expandIri(type, prefixes, loader) ?? type;
}

// expand a CURIE/IRI string against the prefixes to an absolute IRI, or null if
// it does not resolve. uses a property-position probe so prefix expansion and
// @vocab apply with real JSON-LD semantics.
async function _expandIri(value, prefixes, loader) {
  if(typeof value !== 'string') {
    return null;
  }
  const probe = '__vca_probe__';
  try {
    const expanded = await jsonld.expand(
      {'@context': {...prefixes, [probe]: {'@id': value}}, [probe]: 'x'},
      {documentLoader: loader});
    if(expanded.length === 0) {
      return null;
    }
    const iri = Object.keys(expanded[0]).find(key => key !== '@id');
    return iri ?? null;
  } catch {
    return null;
  }
}
