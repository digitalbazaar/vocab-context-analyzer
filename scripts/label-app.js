/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {
  blindKit, buildKit, checkRequest, makeBlinding, unblindLabels
} from '../lib/eval/labelAppCore.js';
import {dirname, join} from 'node:path';
import {readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {loadCases} from '../lib/eval/loadCases.js';
import {runRules} from '../lib/runRules.js';
import {validateLabel} from '../lib/eval/manifestSchema.js';

/**
 * Local-only labeling server for the Phase 2 golden set (design doc section 2.2
 * step 4; spec docs/specs/labeling-app.md). Serves the single-page UI and its
 * API on `127.0.0.1`, builds its dataset at startup (loadCases over both
 * manifests + runRules per case, plus the raw documents for the source view),
 * resumes any labels already on disk, and writes every save to one constant
 * path inside the working tree (`test/fixtures/golden/labels.json`).
 *
 * Run with: `npm run label:app` (override the port with `--port <n>`).
 */

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const FIXTURES = join(ROOT, 'test', 'fixtures');
const GENERATED = join(FIXTURES, 'golden', 'generated');
const APP_HTML = join(ROOT, 'lib', 'eval', 'labelApp.html');
// the output path is a constant, never derived from a request
const LABELS_JSON = join(FIXTURES, 'golden', 'labels.json');

const DEFAULT_PORT = 8642;
const MAX_BODY = 1024 * 1024; // 1 MiB

const readFromGenerated = name =>
  readFile(join(GENERATED, name), 'utf8').then(JSON.parse);
const readFromFixtures = name =>
  readFile(join(FIXTURES, name), 'utf8').then(JSON.parse);

async function loadKit() {
  const golden = JSON.parse(
    await readFile(join(GENERATED, 'manifest.json'), 'utf8'));
  const anchors = JSON.parse(
    await readFile(join(FIXTURES, 'golden', 'anchors.json'), 'utf8'));
  const cases = [
    ...await loadCases({entries: golden, readJson: readFromGenerated}),
    ...await loadCases({entries: anchors, readJson: readFromFixtures})
  ];
  const findingsByCase = {};
  for(const c of cases) {
    findingsByCase[c.name] = runRules(c.model);
  }
  // the raw JSON-LD documents, for the UI's source view
  const sourceByCase = {};
  for(const [entries, readJson] of
    [[golden, readFromGenerated], [anchors, readFromFixtures]]) {
    for(const entry of entries) {
      const source = {context: await readJson(entry.context)};
      if(entry.vocab !== undefined) {
        source.vocab = await readJson(entry.vocab);
      }
      sourceByCase[entry.name] = source;
    }
  }
  const cohorts = JSON.parse(
    await readFile(join(FIXTURES, 'golden', 'cohorts.json'), 'utf8'));
  const {labels, resumed} = await _readExistingLabels();
  // the browser only ever sees pseudonyms — fixture names like
  // "broken-orphan" would leak the expected verdict to the labeler
  const caseBlinding = makeBlinding(cases.map(c => c.name));
  const cohortBlinding = makeBlinding(
    [...new Set(Object.values(cohorts))], {prefix: 'cohort'});
  const kit = blindKit(
    buildKit({cases, findingsByCase, cohorts, labels, sourceByCase}),
    caseBlinding, cohortBlinding);
  return {kit, caseBlinding, resumed};
}

// resume a session from labels.json if present; a missing file is the normal
// fresh-start case, not an error. Every label is validated so a hand-edited
// or corrupted file fails loud at startup
async function _readExistingLabels() {
  try {
    const labels = JSON.parse(await readFile(LABELS_JSON, 'utf8'));
    for(const [name, label] of Object.entries(labels)) {
      validateLabel(label, name);
    }
    return {labels, resumed: true};
  } catch(e) {
    if(e.code === 'ENOENT') {
      return {labels: {}, resumed: false};
    }
    throw e;
  }
}

function _port() {
  const i = process.argv.indexOf('--port');
  if(i !== -1) {
    const port = Number(process.argv[i + 1]);
    if(!Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid --port value: "${process.argv[i + 1]}".`);
    }
    return port;
  }
  return DEFAULT_PORT;
}

function _sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {'content-type': 'application/json; charset=utf-8'});
  res.end(body);
}

async function _readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if(size > MAX_BODY) {
      const err = new Error('payload too large');
      err.tooLarge = true;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const port = _port();
  const {kit, caseBlinding, resumed} = await loadKit();

  const server = createServer((req, res) => {
    _handle(req, res, {kit, caseBlinding}).catch(e => {
      console.error('request handler error:', e);
      if(!res.headersSent) {
        _sendJson(res, 500, {error: 'internal error'});
      }
    });
  });

  server.listen(port, '127.0.0.1', () => {
    console.error(
      `label-app: http://127.0.0.1:${port}  ` +
      `(${kit.cases.length} cases, ` +
      `${resumed ? 'resumed existing labels' : 'no existing labels'})`);
  });
}

async function _handle(req, res, {kit, caseBlinding}) {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  const port = req.socket.localPort;
  const decision = checkRequest({
    method: req.method, path, host: req.headers.host,
    origin: req.headers.origin, port
  });
  if(!decision.allowed) {
    _sendJson(res, decision.status, {error: decision.reason});
    return;
  }

  if(path === '/') {
    const html = await readFile(APP_HTML, 'utf8');
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    res.end(html);
    return;
  }

  if(path === '/api/kit') {
    _sendJson(res, 200, kit);
    return;
  }

  // PUT /api/labels
  let body;
  try {
    body = await _readBody(req);
  } catch(e) {
    if(e.tooLarge) {
      _sendJson(res, 413, {error: 'payload too large'});
      return;
    }
    throw e;
  }

  let labels;
  try {
    ({labels} = JSON.parse(body));
  } catch {
    _sendJson(res, 400, {error: 'invalid JSON body'});
    return;
  }

  let real;
  try {
    // map pseudonyms back to real case names and validate every label —
    // both throw on anything invalid, before anything is written
    real = unblindLabels(labels, caseBlinding);
    for(const [name, label] of Object.entries(real)) {
      validateLabel(label, name);
    }
  } catch(e) {
    _sendJson(res, 400, {error: e.message});
    return;
  }

  await writeFile(LABELS_JSON, JSON.stringify(real, null, 2) + '\n');
  // keep the served kit current so a mid-session page reload gets the
  // latest save, not the labels as of server start
  kit.labels = labels;
  res.writeHead(204);
  res.end();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
