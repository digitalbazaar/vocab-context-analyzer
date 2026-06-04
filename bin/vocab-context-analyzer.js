#!/usr/bin/env node
/*!
 * Copyright (c) 2026 Digital Bazaar, Inc. All rights reserved.
 */
import {run} from '../lib/cli.js';

process.on('unhandledRejection', reason => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

const {stdout, stderr, code} = await run(process.argv.slice(2));
if(stdout) {
  console.log(stdout);
}
if(stderr) {
  console.error(stderr);
}
process.exit(code);
