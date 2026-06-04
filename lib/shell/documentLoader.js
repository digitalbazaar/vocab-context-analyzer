/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {JsonLdDocumentLoader} from 'jsonld-document-loader';

/**
 * Create an offline JSON-LD document loader: deny-by-default, no network. Any
 * URL not registered as a static snapshot fails to resolve rather than being
 * fetched. This is the design-time default for the analyzer (SPEC sections
 * 11.1.2, 12 offline-snapshot mode) — deterministic and CI-safe.
 *
 * Callers wanting live network resolution build their own loader (for example,
 * wrapping `jsonld.documentLoader`) and pass it explicitly.
 *
 * @param {object} [options] - Options.
 * @param {object} [options.snapshots] - An iterable of `[url, document]` pairs
 *   to pre-register, for example a Map from a `@digitalbazaar/*-context`
 *   package.
 *
 * @returns {Function} A jsonld document loader function.
 */
export function createOfflineDocumentLoader({snapshots} = {}) {
  const jdl = new JsonLdDocumentLoader();
  if(snapshots) {
    jdl.addDocuments({documents: snapshots});
  }
  return jdl.build();
}
