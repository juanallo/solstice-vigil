import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'frames-mobile');
mkdirSync(FRAMES_DIR, { recursive: true });

const VIEWPORT = { width: 390, height: 844 };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: VIEWPORT });
const page = await context.newPage();

console.log('Navigating to Solstice Vigil...');
await page.goto('http://localhost:50426/', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(3000);

const frames = [];

async function capture(stepName, clickTargetIdx = -1) {
  const filename = `frame-${String(frames.length).padStart(3, '0')}.png`;
  const filepath = resolve(FRAMES_DIR, filename);
  await page.screenshot({ path: filepath, type: 'png' });
  
  const state = await page.evaluate(() => {
    const p = document.querySelector('p');
    const text = p ? p.textContent : '';
    const h2 = document.querySelector('h2');
    const h2text = h2 ? h2.textContent : '';
    const headerEls = document.querySelectorAll('[class*="flex"][class*="items-center"][class*="justify-between"] span');
    const day = headerEls[0]?.textContent || '';
    const balance = document.querySelector('span.font-bold')?.textContent || '';
    const detail = document.querySelector('.text-\\[10px\\].italic')?.textContent || '';
    const warning = document.querySelector('.animate-pulse')?.textContent || '';
    const meter = document.querySelector('[class*="absolute"][class*="top-1/2"][class*="-translate-y"]');
    const meterLeft = meter ? meter.style.left : '';
    const title = document.querySelector('h1')?.textContent || '';
    const btnEls = document.querySelectorAll('button');
    const btnData = Array.from(btnEls).map(b => {
      const r = b.getBoundingClientRect();
      return { text: b.textContent?.substring(0, 60), x: r.x + r.width/2, y: r.y + r.height/2 };
    });
    return { text, h2text, day, balance, detail, warning, meterLeft, title, btnData };
  });
  
  frames.push({ filename, stepName, state, clickTargetIdx });
  console.log(`[${stepName}] click=${clickTargetIdx}`);
  return state;
}

async function clickChoice(idx) {
  const btns = page.locator('button').filter({ has: page.locator('span') });
  const n = await btns.count();
  if (n > idx) await btns.nth(idx).click();
  else if (n > 0) await btns.first().click();
  await page.waitForTimeout(1200);
}

async function isGameOver() {
  return page.locator('text=the vigil ends').isVisible().catch(() => false);
}

await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// === FEW SCENES, FAST END ===

// Title → click demo
await capture('title-screen', 1);
await page.waitForTimeout(800);
await page.getByText('Try demo mode', { timeout: 15000 }).click();
await page.waitForTimeout(1000);

await capture('click-demo', -1);
await capture('first-scene', 0);
await clickChoice(0);

// Capture a few pushes
let gameEnded = false;
for (let i = 0; i < 3; i++) {
  if (await isGameOver()) { gameEnded = true; break; }
  await capture(`push-${i}`, 0);
  await clickChoice(0);
}

// Keep clicking silently until game over
if (!gameEnded) {
  for (let i = 0; i < 20; i++) {
    if (await isGameOver()) break;
    await clickChoice(0);
  }
}

// Game over
if (await isGameOver()) {
  await capture('game-over', -1);
  const beginBtn = page.locator('button:has-text("Begin again")');
  if (await beginBtn.isVisible()) {
    await beginBtn.click();
    await page.waitForTimeout(1200);
  }
}

await capture('restarted', -1);

const metadata = {
  viewport: VIEWPORT,
  frames: frames.map(f => ({
    file: f.filename,
    stepName: f.stepName,
    clickTargetIdx: f.clickTargetIdx,
    state: {
      title: f.state.title,
      text: f.state.text?.substring(0, 200) || '',
      day: f.state.day,
      balance: f.state.balance,
      detail: f.state.detail,
      warning: f.state.warning,
      meterLeft: f.state.meterLeft,
    },
    btnPositions: f.state.btnData,
  }))
};

writeFileSync(resolve(__dirname, 'metadata-mobile.json'), JSON.stringify(metadata, null, 2));
console.log(`\nCaptured ${frames.length} frames.`);

await browser.close();
