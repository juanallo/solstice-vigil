import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'frames');
mkdirSync(FRAMES_DIR, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };

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
    const allSpans = document.querySelectorAll('span');
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
  console.log(`[${stepName}] click=${clickTargetIdx} "${(state.text||state.title||'').substring(0,60)}"`);
  return state;
}

async function clickChoice(idx) {
  const btns = page.locator('button').filter({ has: page.locator('span') });
  const n = await btns.count();
  if (n > idx) await btns.nth(idx).click();
  else if (n > 0) await btns.first().click();
  await page.waitForTimeout(1200);
}

await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// === SHORTENED FLOW: push aggressively toward light ===

// 1. Title screen → click "Try demo mode"
await capture('title-screen', 1);
await page.waitForTimeout(800);
await page.getByText('Try demo mode', { timeout: 15000 }).click();
await page.waitForTimeout(1000);

// 2. After demo click - first scene appears
await capture('click-demo', -1);

// 3. First scene choices, cursor on button 0 (light)
await capture('first-scene', 0);
await clickChoice(0);

// 4-7. Keep pushing light until game over
for (let i = 0; i < 10; i++) {
  const isOver = await page.locator('text=the vigil ends').isVisible().catch(() => false);
  if (isOver) break;
  
  await capture(`push-${i}`, 0);
  await clickChoice(0);
}

// 8. Game over screen
const isOver = await page.locator('text=the vigil ends').isVisible().catch(() => false);
if (isOver) {
  await capture('game-over', -1);
  const beginBtn = page.locator('button:has-text("Begin again")');
  if (await beginBtn.isVisible()) {
    await beginBtn.click();
    await page.waitForTimeout(1200);
  }
}

// 9. Final message
await capture('restarted', -1);

// Save metadata
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

writeFileSync(resolve(__dirname, 'metadata.json'), JSON.stringify(metadata, null, 2));
console.log(`\nCaptured ${frames.length} frames.`);

await browser.close();
