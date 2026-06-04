/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {exitCodeFor, formatHuman, formatJson} from './report.js';
import {loadModel} from './shell/loadModel.js';
import {readFile} from 'node:fs/promises';
import {runRules} from './runRules.js';

const USAGE = `Usage: vocab-context-analyzer --vocab <file> --context <file> ` +
  `[--format human|json]

Evaluate a JSON-LD vocabulary and its @context for design-quality findings.

Options:
  --vocab    <file>          Path to the JSON-LD vocabulary document (required).
  --context  <file>          Path to the JSON-LD @context document (required).
  --format   human|json      Output format (default: human).
  -h, --help                 Show this help.

Exit codes:
  0  no error-severity findings (warnings/info do not fail)
  1  at least one error-severity finding
  2  usage or IO error`;

// IO/usage failures are distinct from analysis errors (which use code 1)
const USAGE_ERROR_CODE = 2;

/**
 * Run the analyzer CLI. Pure with respect to the process: file reading is
 * injectable and output is returned rather than written, so this is unit
 * testable. The `bin` wrapper supplies real IO and applies the result.
 *
 * @param {string[]} argv - CLI arguments (without `node` and the script path).
 * @param {object} [deps] - Injectable dependencies.
 * @param {Function} [deps.readFileFn] - Reads a file to a string.
 * @param {Function} [deps.loadModelFn] - Builds the model from documents.
 * @param {Function} [deps.runRulesFn] - Runs the rules over a model.
 *
 * @returns {Promise<{stdout: string, stderr: string, code: number}>} Result.
 */
export async function run(argv, {
  readFileFn = _readJson, loadModelFn = loadModel, runRulesFn = runRules
} = {}) {
  let options;
  try {
    options = _parseArgs(argv);
  } catch(e) {
    return {
      stdout: '', stderr: `${e.message}\n\n${USAGE}`, code: USAGE_ERROR_CODE
    };
  }
  if(options.help) {
    return {stdout: USAGE, stderr: '', code: 0};
  }
  if(!options.vocab || !options.context) {
    return {
      stdout: '', code: USAGE_ERROR_CODE,
      stderr: `Both --vocab and --context are required.\n\n${USAGE}`
    };
  }

  let vocab;
  let context;
  try {
    vocab = await readFileFn(options.vocab);
    context = await readFileFn(options.context);
  } catch(e) {
    return {stdout: '', stderr: `Failed to read input: ${e.message}`,
      code: USAGE_ERROR_CODE};
  }

  let findings;
  try {
    const model = await loadModelFn({vocab, context});
    findings = runRulesFn(model);
  } catch(e) {
    return {stdout: '', stderr: `Analysis failed: ${e.message}`,
      code: USAGE_ERROR_CODE};
  }

  const stdout = options.format === 'json' ?
    formatJson(findings) : formatHuman(findings);
  return {stdout, stderr: '', code: exitCodeFor(findings)};
}

function _parseArgs(argv) {
  const options = {format: 'human'};
  for(let i = 0; i < argv.length; ++i) {
    const arg = argv[i];
    switch(arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--vocab':
        options.vocab = _value(argv, ++i, arg);
        break;
      case '--context':
        options.context = _value(argv, ++i, arg);
        break;
      case '--format':
        options.format = _value(argv, ++i, arg);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if(!['human', 'json'].includes(options.format)) {
    throw new Error(
      `--format must be "human" or "json"; got "${options.format}".`);
  }
  return options;
}

function _value(argv, i, flag) {
  const value = argv[i];
  if(value === undefined || value.startsWith('-')) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}

async function _readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}
