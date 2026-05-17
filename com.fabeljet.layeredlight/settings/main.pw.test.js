// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const settingsDir = path.join(__dirname);

const FIXTURE_DEVICES = [
  { id: 'd-dim',      name: 'DimOnly',   caps: { hasDim: true,  hasColor: false, hasTemp: false } },
  { id: 'd-temp',     name: 'DimTemp',   caps: { hasDim: true,  hasColor: false, hasTemp: true  } },
  { id: 'd-color',    name: 'DimColor',  caps: { hasDim: true,  hasColor: true,  hasTemp: true  } },
  { id: 'd-nocaps',   name: 'NoCaps',    caps: { hasDim: false, hasColor: false, hasTemp: false } },
];

const FIXTURE_VARIABLES = [
  { id: 'v1', name: 'Morning', value: 'DimOnly:ff DimTemp:ff80' },
  { id: 'v2', name: 'Evening', value: 'DimColor:off' },
];

// SDK preamble exactly as injected by the Homey build pipeline
const SDK_PREAMBLE = `'use strict';\nObject.defineProperty(exports, "__esModule", { value: true });\n`;

async function setupPage(page) {
  const errors = [];
  page.on('pageerror', (err) => errors.push(err.message));

  // Inject the mock Homey object before any scripts load
  await page.addInitScript(() => {
    window.__previewCalls = [];
    window.__variableWrites = [];

    window.Homey = {
      ready() {},
      api(method, path, body, cb) {
        if (method === 'GET' && path === '/devices') {
          cb(null, window.__mockDevices);
        } else if (method === 'GET' && path === '/variables') {
          cb(null, window.__mockVariables);
        } else if (method === 'POST' && path === '/preview') {
          window.__previewCalls.push(JSON.parse(JSON.stringify(body)));
          cb(null, { ok: true });
        } else if (method === 'POST' && path === '/variable') {
          window.__variableWrites.push(JSON.parse(JSON.stringify(body)));
          cb(null, { ok: true });
        } else {
          cb(new Error('unmocked: ' + method + ' ' + path));
        }
      },
    };

    // homey.js normally calls window.onHomeyReady after load; replicate that here
    window.addEventListener('load', function () {
      if (typeof window.onHomeyReady === 'function') {
        window.onHomeyReady(window.Homey);
      }
    });
  });

  // Serve the real index.html, stripping its browser-only mock block so our Homey mock wins
  await page.route('**/index.html', async (route) => {
    let html = fs.readFileSync(path.join(settingsDir, 'index.html'), 'utf8');
    // Remove the /homey.js script tag (we provide the mock via addInitScript)
    html = html.replace(/<script[^>]+src="\/homey\.js"[^>]*><\/script>\s*/g, '');
    // Remove the inline if(typeof Homey==='undefined'){...} dev-mock block
    html = html.replace(/<script>\s*if \(typeof Homey === 'undefined'\)[\s\S]*?<\/script>/g, '');
    route.fulfill({ contentType: 'text/html', body: html });
  });

  // Serve scene-builder.js as-is
  await page.route('**/scene-builder.js', async (route) => {
    const src = fs.readFileSync(path.join(settingsDir, 'scene-builder.js'), 'utf8');
    route.fulfill({ contentType: 'text/javascript', body: src });
  });

  // Serve main.js with the SDK preamble prepended — this is the injection under test
  await page.route('**/main.js', async (route) => {
    const src = fs.readFileSync(path.join(settingsDir, 'main.js'), 'utf8');
    // Strip the leading 'use strict'; because the SDK preamble already includes it
    const stripped = src.replace(/^'use strict';\s*/m, '');
    route.fulfill({ contentType: 'text/javascript', body: SDK_PREAMBLE + stripped });
  });

  // Provide fixture data before navigation
  await page.addInitScript((fixtures) => {
    window.__mockDevices = fixtures.devices;
    window.__mockVariables = fixtures.variables;
  }, { devices: FIXTURE_DEVICES, variables: FIXTURE_VARIABLES });

  await page.goto('http://localhost/index.html');

  // Wait for initApp to run — spinner should be hidden
  await expect(page.locator('#device-spinner')).toBeHidden({ timeout: 3000 });

  return errors;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test('SDK injection: Object.defineProperty does not prevent initApp from running', async ({ page }) => {
  const errors = await setupPage(page);

  // Device checkboxes must be rendered — proves initApp ran despite the thrown error at line 2
  const checkboxes = page.locator('#device-checkboxes input[type=checkbox]');
  await expect(checkboxes).toHaveCount(FIXTURE_DEVICES.length);

  // The only tolerated error is the SDK injection throw itself
  const fatal = errors.filter((e) => !e.includes('Object.defineProperty') && !e.includes('exports'));
  expect(fatal, 'unexpected page errors: ' + fatal.join('\n')).toHaveLength(0);
});

test('checkbox toggle: checking a device renders its card, unchecking removes it', async ({ page }) => {
  await setupPage(page);

  const dimCb = page.locator('#device-checkboxes input[data-device-id="d-dim"]');
  await dimCb.check();
  await expect(page.locator('.device-card[data-device-id="d-dim"]')).toBeVisible();

  await dimCb.uncheck();
  await expect(page.locator('.device-card[data-device-id="d-dim"]')).toHaveCount(0);
});

test('slider input: fires POST /preview with correct body', async ({ page }) => {
  await setupPage(page);

  await page.locator('#device-checkboxes input[data-device-id="d-dim"]').check();
  const dimSlider = page.locator('.device-card[data-device-id="d-dim"] .ctrl-dim');

  // Move slider to 0.5
  await dimSlider.fill('0.5');
  await dimSlider.dispatchEvent('input');

  // Wait for debounce (300ms) + margin
  await page.waitForTimeout(400);

  const calls = await page.evaluate(() => window.__previewCalls);
  expect(calls.length).toBeGreaterThan(0);

  const last = calls[calls.length - 1];
  expect(last.deviceId).toBe('d-dim');
  expect(last.onoff).toBe(true);
  expect(last.dim).toBeCloseTo(0.5, 2);
  // dim-only device must NOT send hue/sat/temp
  expect(last.hue).toBeUndefined();
  expect(last.sat).toBeUndefined();
  expect(last.temp).toBeUndefined();
});

test('preview body: color device sends hue, sat, dim', async ({ page }) => {
  await setupPage(page);

  await page.locator('#device-checkboxes input[data-device-id="d-color"]').check();
  await page.locator('.device-card[data-device-id="d-color"] .ctrl-dim').fill('0.75');
  await page.locator('.device-card[data-device-id="d-color"] .ctrl-dim').dispatchEvent('input');
  await page.waitForTimeout(400);

  const calls = await page.evaluate(() => window.__previewCalls);
  const last = calls[calls.length - 1];
  expect(last.deviceId).toBe('d-color');
  expect(typeof last.hue).toBe('number');
  expect(typeof last.sat).toBe('number');
  expect(typeof last.dim).toBe('number');
  expect(typeof last.temp).toBe('number'); // d-color also hasTemp
});

test('pass-through mode: hides controls and does not fire preview', async ({ page }) => {
  await setupPage(page);

  await page.locator('#device-checkboxes input[data-device-id="d-dim"]').check();
  const modeSelect = page.locator('.device-card[data-device-id="d-dim"] .ctrl-mode');
  await modeSelect.selectOption('null');

  await expect(page.locator('.device-card[data-device-id="d-dim"] .controls')).toBeHidden();

  // Move slider — shouldn't do anything since card is in pass-through
  // (slider is hidden but we verify no preview was sent for this device after mode change)
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() =>
    window.__previewCalls.filter((c) => c.deviceId === 'd-dim')
  );
  expect(calls).toHaveLength(0);
});

test('load variable: populates checkboxes and scene-output', async ({ page }) => {
  await setupPage(page);

  await page.locator('#var-load-select').selectOption('v1');
  await page.locator('#var-load-btn').click();

  // v1 = 'DimOnly:ff DimTemp:ff80' — both devices should be checked
  await expect(page.locator('#device-checkboxes input[data-device-id="d-dim"]')).toBeChecked();
  await expect(page.locator('#device-checkboxes input[data-device-id="d-temp"]')).toBeChecked();

  const output = await page.locator('#scene-output').inputValue();
  expect(output).toContain('DimOnly:');
  expect(output).toContain('DimTemp:');
});

test('write variable: calls POST /variable with id and value', async ({ page }) => {
  await setupPage(page);

  await page.locator('#device-checkboxes input[data-device-id="d-dim"]').check();
  await page.locator('#var-write-select').selectOption('v1');
  await page.locator('#write-btn').click();

  const writes = await page.evaluate(() => window.__variableWrites);
  expect(writes).toHaveLength(1);
  expect(writes[0].id).toBe('v1');
  expect(typeof writes[0].value).toBe('string');
  expect(writes[0].value.length).toBeGreaterThan(0);
});
