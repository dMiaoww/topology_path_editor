import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const workspaceRoot = path.resolve(projectRoot, '..');
const topologyFile = path.join(workspaceRoot, 'src/topo_points/paths/floor2.json');
const url = process.env.APP_URL || 'http://localhost:5173/';
const executablePath = process.env.CHROME_BIN || '/usr/bin/google-chrome';

if (!existsSync(topologyFile)) {
  throw new Error(`Sample topology JSON not found: ${topologyFile}`);
}

const smokeMap = [
  '-2 -2 0',
  '-1 -1 0.1',
  '0 0 0.15',
  '1 1 0.1',
  '2 2 0',
  '-2 2 0.2',
  '2 -2 0.2',
  '0 2 0.3',
  '2 0 0.25',
].join('\n');

async function sampleCanvas(page) {
  await page.waitForSelector('canvas');
  await page.waitForTimeout(900);
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return { ok: false, reason: 'no-webgl-context' };

    const width = Math.min(96, gl.drawingBufferWidth);
    const height = Math.min(96, gl.drawingBufferHeight);
    const x = Math.max(0, Math.floor((gl.drawingBufferWidth - width) / 2));
    const y = Math.max(0, Math.floor((gl.drawingBufferHeight - height) / 2));
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(x, y, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let alphaPixels = 0;
    const buckets = new Set();
    for (let index = 0; index < pixels.length; index += 16) {
      if (pixels[index + 3] > 0) alphaPixels += 1;
      buckets.add(`${pixels[index] >> 4},${pixels[index + 1] >> 4},${pixels[index + 2] >> 4}`);
    }

    return {
      ok: alphaPixels > 0 && buckets.size > 2,
      drawingBufferWidth: gl.drawingBufferWidth,
      drawingBufferHeight: gl.drawingBufferHeight,
      alphaPixels,
      colorBuckets: buckets.size,
    };
  });
}

async function verifyViewport(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.setInputFiles('[data-testid="topology-input"]', topologyFile);
  await page.setInputFiles('[data-testid="map-input"]', {
    name: 'smoke.xyz',
    mimeType: 'text/plain',
    buffer: Buffer.from(smokeMap),
  });
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 1);
  const stats = await sampleCanvas(page);
  await page.screenshot({ path: `/tmp/topology-editor-${name}.png`, fullPage: true });
  await page.close();

  if (!stats.ok) {
    throw new Error(`${name} canvas check failed: ${JSON.stringify(stats)}`);
  }

  return { name, viewport, stats, screenshot: `/tmp/topology-editor-${name}.png` };
}

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const results = [];
  results.push(await verifyViewport(browser, { width: 1440, height: 900 }, 'desktop'));
  results.push(await verifyViewport(browser, { width: 390, height: 844 }, 'mobile'));
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
