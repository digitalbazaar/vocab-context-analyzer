/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {exitCodeFor, formatHuman, formatJson} from './report.js';
import {buildFromSource} from './shell/buildFromSource.js';
import {loadModel} from './shell/loadModel.js';
import {readFile} from 'node:fs/promises';
import {runRules} from './runRules.js';

const USAGE = `Usage: vocab-context-analyzer --vocab <file> --context <file> ` +
  `[--format human|json]
   vocab-context-analyzer --yaml <vocabulary.yml> [--format human|json]

Evaluate a JSON-LD vocabulary and its @context for design-quality findings.

Options:
  --vocab    <file>          Path to the JSON-LD vocabulary document (required
                             unless --yaml).
  --context  <file>          Path to the JSON-LD @context document (required
                             unless --yaml).
  --yaml     <vocabulary.yml> Build the vocabulary and @context from a yml2vocab
                             source, then analyze the generated output. A build
                             failure is terminal. Cannot be combined with
                             --vocab or --context.
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
 * @param {Function} [deps.readFileFn] - Reads and JSON-parses a document file
 *   (used for --vocab/--context artifact mode).
 * @param {Function} [deps.readTextFn] - Reads a file to raw text (used for the
 *   --yaml source, which is not JSON).
 * @param {Function} [deps.buildFromSourceFn] - Builds {vocab, context} from a
 *   yml2vocab source (used only in --yaml mode).
 * @param {Function} [deps.loadModelFn] - Builds the model from documents.
 * @param {Function} [deps.runRulesFn] - Runs the rules over a model.
 *
 * @returns {Promise<{stdout: string, stderr: string, code: number}>} Result.
 */
export async function run(argv, {
  readFileFn = _readJson, readTextFn = _readText,
  buildFromSourceFn = buildFromSource,
  loadModelFn = loadModel, runRulesFn = runRules
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
  if(options.yaml && (options.vocab || options.context)) {
    return {
      stdout: '', code: USAGE_ERROR_CODE,
      stderr: '--yaml cannot be combined with --vocab or --context.\n\n' +
        USAGE
    };
  }
  if(!options.yaml && (!options.vocab || !options.context)) {
    return {
      stdout: '', code: USAGE_ERROR_CODE,
      stderr: `Both --vocab and --context are required.\n\n${USAGE}`
    };
  }

  let vocab;
  let context;
  try {
    if(options.yaml) {
      // build the artifacts from a yml2vocab source upstream of the rule engine
      const yamlText = await readTextFn(options.yaml);
      const built = await buildFromSourceFn(yamlText);
      // a failed build is terminal: report it and skip the rules entirely
      if(built.buildFinding) {
        const findings = [built.buildFinding];
        return {stdout: _render(findings, options.format), stderr: '',
          code: exitCodeFor(findings)};
      }
      ({vocab, context} = built);
    } else {
      vocab = await readFileFn(options.vocab);
      context = await readFileFn(options.context);
    }
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

  return {stdout: _render(findings, options.format), stderr: '',
    code: exitCodeFor(findings)};
}

function _render(findings, format) {
  return format === 'json' ? formatJson(findings) : formatHuman(findings);
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
      case '--yaml':
        options.yaml = _value(argv, ++i, arg);
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

async function _readText(path) {
  return readFile(path, 'utf8');
}
