/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */

/**
 * Pure functional core for the golden-set labeling app (docs/specs/
 * labeling-app.md). No IO: `buildKit` shapes the loaded cases, findings, and
 * cohorts into the JSON the browser expects from `GET /api/kit`, and
 * `checkRequest` is the same-origin/localhost security decision the server
 * applies before touching any file. The imperative shell lives in
 * scripts/label-app.js.
 */

// the only routes the server exposes, path -> allowed method
const ROUTES = {
  '/': 'GET',
  '/api/kit': 'GET',
  '/api/labels': 'PUT'
};

// term fields surfaced to the UI, in the order the reference renders them
const TERM_FIELDS = ['iri', 'kind', 'label', 'comment', 'domain', 'range'];

/**
 * Build the labeling kit the browser fetches from `GET /api/kit`. Flattens each
 * case's `model.vocab.terms` to the plain fields the UI renders, maps findings
 * to `{id, message}`, attaches the cohort from the cohorts map, and passes the
 * existing labels through untouched.
 *
 * @param {object} input - The input.
 * @param {object[]} input.cases - Loaded cases: `{name, model}`.
 * @param {object} input.findingsByCase - Map of case name to its `Finding[]`.
 * @param {object} input.cohorts - Map of case name to cohort id; every case
 *   name must be present or this throws.
 * @param {object} input.labels - Map of case name to a saved label, or `{}`.
 * @param {object} [input.sourceByCase] - Optional map of case name to its raw
 *   documents `{vocab?, context}`, surfaced so the UI can show the actual
 *   JSON-LD alongside the flattened terms.
 *
 * @returns {{cases: object[], labels: object}} The kit: one entry per case as
 *   `{name, cohort, terms, findings, source?}`, plus the passed-through
 *   labels.
 */
export function buildKit({
  cases, findingsByCase, cohorts, labels, sourceByCase = {}
}) {
  const kitCases = cases.map(c => {
    const cohort = cohorts[c.name];
    if(cohort === undefined) {
      throw new Error(
        `Case "${c.name}" is missing from the cohorts map.`);
    }
    const kitCase = {
      name: c.name,
      cohort,
      terms: c.model.vocab.terms.map(_flattenTerm),
      findings: (findingsByCase[c.name] ?? [])
        .map(f => ({id: f.id, message: f.message}))
    };
    if(sourceByCase[c.name] !== undefined) {
      kitCase.source = sourceByCase[c.name];
    }
    return kitCase;
  });
  return {cases: kitCases, labels};
}

/**
 * Decide whether an incoming request is allowed, purely from its request line
 * and the `Host`/`Origin` headers. Blocks DNS-rebinding and cross-site writes:
 * the `Host` must be `127.0.0.1`/`localhost` (bare or with the port), and any
 * present `Origin` must match `http://127.0.0.1:<port>` or
 * `http://localhost:<port>`. Unknown paths 404; a wrong method for a known
 * path 405.
 *
 * @param {object} req - The request facts.
 * @param {string} req.method - The HTTP method.
 * @param {string} req.path - The request path (no query string).
 * @param {string} [req.host] - The `Host` header.
 * @param {string} [req.origin] - The `Origin` header, if any.
 * @param {number} req.port - The port the server is bound to.
 *
 * @returns {{allowed: boolean, status?: number, reason?: string}} The decision;
 *   `status`/`reason` are set only when not allowed.
 */
export function checkRequest({method, path, host, origin, port}) {
  if(!_hostOk(host, port)) {
    return {allowed: false, status: 403, reason: 'bad Host header'};
  }
  if(origin !== undefined && !_originOk(origin, port)) {
    return {allowed: false, status: 403, reason: 'bad Origin header'};
  }
  const allowedMethod = ROUTES[path];
  if(allowedMethod === undefined) {
    return {allowed: false, status: 404, reason: 'unknown path'};
  }
  if(method !== allowedMethod) {
    return {allowed: false, status: 405, reason: 'method not allowed'};
  }
  return {allowed: true};
}

/**
 * Build a stable two-way pseudonym mapping for a set of names. The UI must
 * never see fixture names like `broken-orphan` — they leak the expected
 * verdict and bias the expert labels — so the server serves pseudonyms and
 * maps back on save. Assignment order comes from a small string hash, not
 * input order, so a pseudonym's number carries no information about manifest
 * position; the mapping is deterministic across restarts.
 *
 * @param {string[]} names - The real names to blind.
 * @param {object} [options] - Options.
 * @param {string} [options.prefix] - Pseudonym prefix (default `case`).
 *
 * @returns {{toBlind: object, toReal: object}} Maps real name -> pseudonym
 *   and pseudonym -> real name.
 */
export function makeBlinding(names, {prefix = 'case'} = {}) {
  const sorted = [...names].sort((a, b) =>
    _hash(a) - _hash(b) || (a < b ? -1 : 1));
  const width = String(sorted.length).length;
  const toBlind = {};
  const toReal = {};
  sorted.forEach((name, i) => {
    const pseudonym = `${prefix}-${String(i + 1).padStart(width, '0')}`;
    toBlind[name] = pseudonym;
    toReal[pseudonym] = name;
  });
  return {toBlind, toReal};
}

/**
 * Blind a built kit for serving: case and cohort names become pseudonyms,
 * label keys are rekeyed, and cases are ordered by pseudonym so display order
 * carries no information either. Throws if a saved label names a case outside
 * the blinding (a corrupted or hand-edited labels.json), failing loud at
 * startup
 * rather than serving a broken kit.
 *
 * @param {object} kit - The kit from `buildKit`.
 * @param {object} caseBlinding - `makeBlinding` result for case names.
 * @param {object} cohortBlinding - `makeBlinding` result for cohort ids.
 *
 * @returns {{cases: object[], labels: object}} The blinded kit; the input is
 *   not mutated.
 */
export function blindKit(kit, caseBlinding, cohortBlinding) {
  const cases = kit.cases.map(c => ({
    ...c,
    name: caseBlinding.toBlind[c.name],
    cohort: cohortBlinding.toBlind[c.cohort]
  })).sort((a, b) => a.name < b.name ? -1 : 1);
  const labels = {};
  for(const [name, label] of Object.entries(kit.labels)) {
    const pseudonym = caseBlinding.toBlind[name];
    if(pseudonym === undefined) {
      throw new Error(`Saved label names an unknown case "${name}".`);
    }
    labels[pseudonym] = label;
  }
  return {cases, labels};
}

/**
 * Map a pseudonym-keyed label payload from the browser back to real case
 * names before it is written to labels.json. Throws on an unknown pseudonym
 * so a stale or tampered payload is rejected, never written.
 *
 * @param {object} labels - Map of pseudonym to label.
 * @param {object} caseBlinding - `makeBlinding` result for case names.
 *
 * @returns {object} The same labels keyed by real case name.
 */
export function unblindLabels(labels, caseBlinding) {
  const out = {};
  for(const [pseudonym, label] of Object.entries(labels)) {
    const name = caseBlinding.toReal[pseudonym];
    if(name === undefined) {
      throw new Error(`Unknown case id "${pseudonym}".`);
    }
    out[name] = label;
  }
  return out;
}

// small deterministic string hash (djb2-xor) — only used to scramble
// pseudonym assignment order, no cryptographic strength needed
function _hash(s) {
  let h = 5381;
  for(let i = 0; i < s.length; ++i) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function _flattenTerm(term) {
  const flat = {};
  for(const field of TERM_FIELDS) {
    if(term[field] !== undefined) {
      flat[field] = term[field];
    }
  }
  // yml2vocab emits labels/comments as HTML (wrapped in divs); the term
  // summary is a plain-text view, so strip the markup here — the source view
  // still shows the artifact verbatim
  for(const field of ['label', 'comment']) {
    if(typeof flat[field] === 'string') {
      flat[field] = _stripMarkup(flat[field]);
    }
  }
  return flat;
}

function _stripMarkup(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function _hostOk(host, port) {
  if(typeof host !== 'string') {
    return false;
  }
  return host === '127.0.0.1' || host === 'localhost' ||
    host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function _originOk(origin, port) {
  return origin === `http://127.0.0.1:${port}` ||
    origin === `http://localhost:${port}`;
}
