/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * The resolved vocab+context model the functional core operates on.
 *
 * This shape is intentionally INFORMAL: the imperative shell (file loading,
 * prefix expansion, IRI resolution) builds it, and the core documents here what
 * it assumes. It can be formalized into a schema later if a stable contract
 * with the shell warrants it.
 *
 * The core performs NO parsing, fetching, or prefix expansion. It assumes IRIs
 * are already absolute where resolvable, and `null` where the shell could not
 * resolve them.
 *
 * @typedef {object} Model
 * @property {Vocab} vocab - The vocabulary side.
 * @property {Context} context - The `@context` side.
 *
 * @typedef {object} Vocab
 * @property {string} [namespace] - The vocabulary's base IRI, used to decide
 *   which context mappings point "into" the vocab (orphan detection).
 * @property {Term[]} terms - The defined terms.
 *
 * @typedef {object} Term
 * @property {string} id - Local name of the term.
 * @property {string} iri - Absolute IRI of the term.
 * @property {string} [type] - RDF type CURIE/IRI.
 * @property {string} [label] - `rdfs:label`.
 * @property {string} [comment] - `rdfs:comment`.
 * @property {string|string[]} [domain] - `rdfs:domain`.
 * @property {string|string[]} [range] - `rdfs:range`.
 * @property {boolean} [deprecated] - Whether the term is deprecated.
 *
 * @typedef {object} Context
 * @property {Mapping[]} mappings - Resolved key -> IRI mappings.
 * @property {object} [raw] - The original `@context` object, for future
 *   processing checks (e.g. `@type` coercion, `@protected`).
 *
 * @typedef {object} Mapping
 * @property {string} term - The context key (alias).
 * @property {string|null} iri - The resolved absolute IRI, or `null` if the
 *   shell could not resolve it.
 */

export {};
