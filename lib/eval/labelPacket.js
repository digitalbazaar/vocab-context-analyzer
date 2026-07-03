/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * Build a human-labeling packet for one golden-set case (Phase 2 eval gate,
 * design doc section 2.2, step 4). A labeler reads the packet and fills in the
 * subjective labels the deterministic rules cannot produce: an `overall`
 * verdict, a `designRank`, and per-term `subjectiveIssues`.
 *
 * The packet renders each term in a readable, self-contained form (so the
 * labeler is not reading raw JSON-LD), lists the deterministic findings the
 * rules already caught (so the labeler does not re-flag objective problems),
 * and carries an empty label stub matching the manifest schema (so the filled
 * packet drops straight back into the manifest). Pure — no IO.
 *
 * @param {object} caseInput - A loaded case.
 * @param {string} caseInput.name - The case name.
 * @param {object} caseInput.model - The resolved model (`{vocab, context}`).
 * @param {object[]} findings - The deterministic `Finding[]` for the case.
 *
 * @returns {object} The packet: `{name, terms, deterministicFindings, labels}`.
 */
export function buildLabelPacket({name, model}, findings) {
  const terms = model.vocab.terms.map(_renderTerm);
  return {
    name,
    terms,
    // what the rules already found — the labeler adds the subjective layer on
    // top rather than re-reporting these
    deterministicFindings: findings,
    // empty label fields for the labeler to fill; shapes match manifestSchema
    // shapes match manifestSchema: overall is a verdict band, designRank an
    // ordinal within the case's cohort, subjectiveIssues a {term, category,
    // note} list with category drawn from the rubric
    labels: {
      overall: null,
      designRank: null,
      subjectiveIssues: []
    }
  };
}

// a flat, readable view of a Term: absent optional fields render as null so the
// labeler can see at a glance what is missing (e.g. no comment to judge).
function _renderTerm(term) {
  return {
    iri: term.iri,
    kind: term.kind,
    label: term.label ?? null,
    comment: term.comment ?? null,
    domain: term.domain ?? null,
    range: term.range ?? null,
    subClassOf: term.subClassOf ?? null,
    deprecated: term.deprecated ?? false
  };
}
