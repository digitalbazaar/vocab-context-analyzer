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
  const prefixes = _prefixEntries(context);
  const termKeys = Object.keys(context).filter(
    key => !key.startsWith('@') && !(key in prefixes));

  const mappings = [];
  for(const term of termKeys) {
    const iri = await _resolveTerm({context, prefixes, term, loader});
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

// prefix entries: keys whose value is a string mapping to an absolute IRI
function _prefixEntries(context) {
  const out = {};
  for(const [key, value] of Object.entries(context)) {
    if(key.startsWith('@')) {
      continue;
    }
    if(typeof value === 'string' && _isNamespace(value)) {
      out[key] = value;
    }
  }
  return out;
}

// a namespace value either has an authority (`scheme://`) or ends in a `#`/`/`
// delimiter; a CURIE term value (`ex:name`) has neither
function _isNamespace(value) {
  return NAMESPACE_IRI.test(value) ||
    value.endsWith('#') || value.endsWith('/');
}

async function _resolveTerm({context, prefixes, term, loader}) {
  const slim = {...prefixes, [term]: context[term]};
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
