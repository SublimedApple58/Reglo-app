# Playwright API Reference (quick)

Progressive-disclosure reference for advanced tasks. The core workflow lives in `SKILL.md`.

## Selectors & locators
- Prefer role/text locators: `page.getByRole('button', { name: 'Submit' })`, `page.getByText(...)`.
- CSS/attribute: `page.locator('input[name="email"]')`.
- Wait explicitly: `await page.waitForSelector(sel, { timeout: 10000 })`, `waitForURL`, `waitForLoadState('networkidle')`.

## Contexts, headers & auth
- Use `helpers.createContext(browser, opts)` (or `getContextOptionsWithHeaders(opts)` for raw API) to apply
  env headers (`PW_HEADER_NAME`/`PW_HEADER_VALUE`, `PW_EXTRA_HEADERS`).
- Persist auth: `context.storageState({ path })` then `browser.newContext({ storageState: path })`.

## Network interception
- `await page.route('**/api/**', route => route.fulfill({ json: {...} }))` to mock.
- `await page.request.get(url)` / `.head(url)` for direct API checks (used in the broken-link example).

## Device emulation
- `const { devices } = require('playwright'); browser.newContext({ ...devices['iPhone 13'] })`.

## Debugging
- `headless: false`, `slowMo: 100`, `page.pause()`, `PWDEBUG=1`.
- Screenshots/video/trace via context options for failure diagnosis.

For the full upstream docs see https://playwright.dev/docs/intro.
