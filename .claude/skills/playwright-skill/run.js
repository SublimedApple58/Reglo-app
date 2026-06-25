#!/usr/bin/env node
'use strict';

/*
 * Universal Playwright executor.
 *
 * Usage:
 *   node run.js /tmp/playwright-test-foo.js     # run a script file
 *   node run.js "await page.goto(...)"          # run inline code (top-level await OK)
 *
 * Both forms get these identifiers in scope (no require needed for the common case):
 *   chromium, firefox, webkit, helpers, getContextOptionsWithHeaders, require
 *
 * Self-contained file scripts that do their own `require('playwright')` also work:
 * NODE_PATH is pointed at this skill's node_modules so resolution succeeds even
 * when the script lives in /tmp.
 */

const fs = require('fs');
const path = require('path');

// Make `require('playwright')` resolve from /tmp scripts too.
process.env.NODE_PATH = [
  path.join(__dirname, 'node_modules'),
  process.env.NODE_PATH || '',
]
  .filter(Boolean)
  .join(path.delimiter);
require('module').Module._initPaths();

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  console.error('❌ Playwright is not installed. Run setup first:');
  console.error(`   cd "${__dirname}" && npm run setup`);
  process.exit(1);
}

const { chromium, firefox, webkit } = playwright;
const helpers = require('./lib/helpers');

function getContextOptionsWithHeaders(options = {}) {
  return helpers.getContextOptionsWithHeaders(options);
}

// Expose identifiers used by inline scripts (which don't require anything).
globalThis.require = require;
globalThis.chromium = chromium;
globalThis.firefox = firefox;
globalThis.webkit = webkit;
globalThis.helpers = helpers;
globalThis.getContextOptionsWithHeaders = getContextOptionsWithHeaders;

process.on('unhandledRejection', (e) => {
  console.error('❌ Script error:', e && e.stack ? e.stack : e);
  process.exit(1);
});

(async () => {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: node run.js <script.js | "inline code">');
    process.exit(1);
  }

  const isFile = fs.existsSync(arg) && fs.statSync(arg).isFile();
  try {
    if (isFile) {
      // File scripts are self-contained (own IIFE / own requires). Execute them
      // directly so the parser sees a normal module — globals (chromium, helpers,
      // getContextOptionsWithHeaders) and NODE_PATH are already set up above.
      require(path.resolve(arg));
    } else {
      // Inline code: wrap in an async function so top-level await works.
      const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
      await new AsyncFunction(arg)();
    }
  } catch (e) {
    console.error('❌ Script error:', e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
