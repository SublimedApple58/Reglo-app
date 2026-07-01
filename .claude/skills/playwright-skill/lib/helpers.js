'use strict';

const http = require('http');

// Common dev-server ports to probe when auto-detecting.
const COMMON_PORTS = [
  3000, 3001, 3002, 4200, 5173, 5174, 5175, 8080, 8000, 8081,
  5000, 4321, 3333, 9000, 1234, 8888, 4000, 7000,
];

function probePort(port, timeout = 400) {
  return new Promise((resolve) => {
    const req = http.get(
      { host: 'localhost', port, path: '/', timeout },
      (res) => {
        res.resume(); // drain
        resolve({ port, url: `http://localhost:${port}`, status: res.statusCode });
      }
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Detect locally running dev servers by probing common ports.
 * @returns {Promise<Array<{port:number,url:string,status:number}>>}
 */
async function detectDevServers(ports = COMMON_PORTS) {
  const results = await Promise.all(ports.map((p) => probePort(p)));
  return results.filter(Boolean);
}

/** Read custom HTTP headers from env (PW_HEADER_NAME/VALUE and PW_EXTRA_HEADERS JSON). */
function getExtraHeaders() {
  const headers = {};
  if (process.env.PW_HEADER_NAME && process.env.PW_HEADER_VALUE) {
    headers[process.env.PW_HEADER_NAME] = process.env.PW_HEADER_VALUE;
  }
  if (process.env.PW_EXTRA_HEADERS) {
    try {
      Object.assign(headers, JSON.parse(process.env.PW_EXTRA_HEADERS));
    } catch (e) {
      console.warn('⚠️  PW_EXTRA_HEADERS is not valid JSON, ignoring.');
    }
  }
  return headers;
}

/** Merge env-configured headers into Playwright context options. */
function getContextOptionsWithHeaders(options = {}) {
  const headers = getExtraHeaders();
  if (Object.keys(headers).length) {
    return {
      ...options,
      extraHTTPHeaders: { ...(options.extraHTTPHeaders || {}), ...headers },
    };
  }
  return options;
}

/** Create a browser context that automatically applies env-configured headers. */
async function createContext(browser, options = {}) {
  return browser.newContext(getContextOptionsWithHeaders(options));
}

/** Click with retries to tolerate transient render delays. */
async function safeClick(page, selector, { retries = 3, timeout = 5000 } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      await page.waitForSelector(selector, { timeout });
      await page.click(selector);
      return true;
    } catch (e) {
      lastErr = e;
      await page.waitForTimeout(300);
    }
  }
  throw lastErr;
}

/** Clear a field then type into it. */
async function safeType(page, selector, text, { timeout = 5000 } = {}) {
  await page.waitForSelector(selector, { timeout });
  await page.fill(selector, '');
  await page.type(selector, text);
}

/** Take a timestamped full-page screenshot under /tmp and return its path. */
async function takeScreenshot(page, name = 'screenshot') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = `/tmp/${name}-${ts}.png`;
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
}

/** Best-effort dismissal of common cookie/consent banners. */
async function handleCookieBanner(page) {
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("Accept all")',
    'button:has-text("Accetta")',
    'button:has-text("Accetta tutti")',
    'button:has-text("I agree")',
    'button:has-text("Got it")',
    '[aria-label*="accept" i]',
    '#onetrust-accept-btn-handler',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 800 })) {
        await el.click();
        return true;
      }
    } catch (e) {
      /* keep trying */
    }
  }
  return false;
}

/** Extract a table into an array of row objects keyed by header text. */
async function extractTableData(page, selector = 'table') {
  return page.$eval(selector, (table) => {
    const headers = Array.from(table.querySelectorAll('thead th, tr:first-child th, tr:first-child td')).map(
      (th) => th.textContent.trim()
    );
    const rows = Array.from(table.querySelectorAll('tbody tr')).length
      ? Array.from(table.querySelectorAll('tbody tr'))
      : Array.from(table.querySelectorAll('tr')).slice(1);
    return rows.map((tr) => {
      const cells = Array.from(tr.querySelectorAll('td'));
      const obj = {};
      cells.forEach((td, i) => {
        obj[headers[i] || `col${i}`] = td.textContent.trim();
      });
      return obj;
    });
  });
}

module.exports = {
  detectDevServers,
  getExtraHeaders,
  getContextOptionsWithHeaders,
  createContext,
  safeClick,
  safeType,
  takeScreenshot,
  handleCookieBanner,
  extractTableData,
};
