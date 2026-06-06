/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {ARTIFACT, createFinding, SEVERITY} from '../finding.js';

const ID = 'ctx/missing-coercion';

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const XSD_STRING = `${XSD}string`;
// language-tagged strings must NOT be coerced, or JSON-LD language/direction
// handling is lost (SPEC section 5.1, the rdf:langString caveat)
const LANG_STRINGS = new Set([`${RDF}langString`, `${RDF}dirLangString`]);

/**
 * Where the vocabulary declares a property's range, the context mapping should
 * carry a matching `@type` coercion (SPEC section 5.1, context checks):
 *
 * - an object property (range is a non-datatype IRI) should coerce to `@id`;
 * - a typed datatype property should coerce to that datatype.
 *
 * Exceptions that need no coercion: `xsd:string` (the JSON-LD default) and
 * language-tagged strings (coercing them breaks internationalization). Only
 * properties present in the context are checked. Reported as a warning.
 *
 * @param {object} model - The resolved {@link module:model~Model}.
 *
 * @returns {object[]} One finding per property missing an expected coercion.
 */
export function missingCoercion(model) {
  const mappingByIri = new Map();
  for(const mapping of model.context.mappings) {
    if(typeof mapping.iri === 'string') {
      mappingByIri.set(mapping.iri, mapping);
    }
  }

  const findings = [];
  for(const term of model.vocab.terms) {
    if(term.kind !== 'property' || !Array.isArray(term.range) ||
      term.range.length === 0) {
      continue;
    }
    const mapping = mappingByIri.get(term.iri);
    if(!mapping) {
      // not in the context; coverage handles that, not coercion
      continue;
    }
    const expected = _expectedCoercion(term.range);
    if(expected === null || mapping.coercion === expected) {
      continue;
    }
    findings.push(createFinding({
      id: ID,
      severity: SEVERITY.warning,
      artifact: ARTIFACT.context,
      term: term.iri,
      message: `Property <${term.iri}> has a range that expects an ` +
        `"${expected}" @type coercion in the context, but none is declared.`,
      remediation: `Add "@type": "${expected}" to the term's context mapping.`
    }));
  }
  return findings;
}

// the @type coercion a range implies, or null when none is expected
function _expectedCoercion(range) {
  // language strings and the default string type need no coercion
  if(range.some(r => LANG_STRINGS.has(r)) || range.includes(XSD_STRING)) {
    return null;
  }
  // a datatype range (xsd:* etc.) coerces to that datatype; a single range is
  // the common case
  if(range.length === 1 && range[0].startsWith(XSD)) {
    return range[0];
  }
  // otherwise the range is a class/node reference -> object property -> @id
  if(range.every(r => !r.startsWith(XSD))) {
    return '@id';
  }
  // mixed datatype + class ranges are ambiguous; do not flag
  return null;
}
