import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('C:/Users/WuYa1/AppData/Local/Temp/puppeteer-test/node_modules/puppeteer-core/lib/cjs/puppeteer/puppeteer-core.js');
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const screenshotDir = join(__dirname, 'temporary screenshots');
if (!existsSync(screenshotDir)) mkdirSync(screenshotDir, { recursive: true });

const url      = process.argv[2] || 'http://localhost:3000';
const selector = process.argv[3] || 'body';
const label    = process.argv[4] || 'clip';

const files = readdirSync(screenshotDir);
const nums  = files.map(f => f.match(/^screenshot-(\d+)/)).filter(Boolean).map(m => parseInt(m[1]));
const next  = nums.length > 0 ? Math.max(...nums) + 1 : 1;
const outPath = join(screenshotDir, `screenshot-${next}-${label}.png`);

const browser = await puppeteer.launch({
  executablePath: 'C:/Users/WuYa1/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe',
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

const el = await page.$(selector);
if (el) {
  await el.screenshot({ path: outPath });
} else {
  // fallback: full page
  await page.screenshot({ path: outPath, fullPage: true });
}
console.log(`Saved: ${outPath}`);
await browser.close();
