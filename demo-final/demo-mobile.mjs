import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'frames-mobile');
mkdirSync(FRAMES_DIR, { recursive: true });

const BASE_URL = process.env.DEMO_BASE_URL ?? 'http://127.0.0.1:4321';
const VIEWPORT = { width: 390, height: 844 };

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: VIEWPORT,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

await page.emulateMedia({ reducedMotion: 'no-preference' });

await page.addInitScript((seed) => {
  let state = seed;
  Math.random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
}, 0.42);

const frames = [];

async function readPageState() {
  return page.evaluate(() => {
    const p = document.querySelector('[data-testid="narration"]') ?? document.querySelector('p');
    const text = p ? p.textContent : '';
    const h2 = document.querySelector('h2');
    const h2text = h2 ? h2.textContent : '';
    const day = document.querySelector('[data-testid="day-count"]')?.textContent || '';
    const balance = document.querySelector('span.font-bold')?.textContent || '';
    const detail = document.querySelector('.text-\\[10px\\].italic')?.textContent || '';
    const warning = document.querySelector('[data-testid="balance-warning"]')?.textContent
      || document.querySelector('.animate-pulse')?.textContent || '';
    const meter = document.querySelector('[data-testid="balance-marker"]');
    const meterLeft = meter ? meter.style.left : '';
    const title = document.querySelector('h1')?.textContent || '';
    const btnEls = document.querySelector('[data-testid="choices"]')?.querySelectorAll('button')
      ?? document.querySelectorAll(
        'button:not([data-testid="audio-toggle"]):not([data-testid="narration-play"]):not([data-testid="narration-autoplay"])',
      );
    const btnData = Array.from(btnEls).map((b) => {
      const r = b.getBoundingClientRect();
      return {
        text: b.textContent?.substring(0, 80) ?? '',
        testId: b.getAttribute('data-testid') ?? '',
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
      };
    });
    return { text, h2text, day, balance, detail, warning, meterLeft, title, btnData };
  });
}

async function capture(stepName, clickTarget = null) {
  const filename = `frame-${String(frames.length).padStart(3, '0')}.png`;
  const filepath = resolve(FRAMES_DIR, filename);
  await page.screenshot({ path: filepath, type: 'png' });

  const state = await readPageState();
  frames.push({ filename, stepName, clickTarget, state });
  console.log(`[${stepName}] "${(state.text || state.title || state.h2text || '').substring(0, 70)}"`);
  return state;
}

async function waitForScene() {
  const dice = page.getByTestId('dice-reveal');
  try {
    await dice.waitFor({ state: 'visible', timeout: 500 });
    await dice.waitFor({ state: 'hidden', timeout: 8000 });
  } catch {
    /* no dice animation */
  }

  const identity = page.getByTestId('identity-reveal-screen');
  const discovery = page.getByTestId('encounter-discovery-screen');
  const gameOver = page.getByTestId('gameover-screen');

  if (await identity.isVisible().catch(() => false)) return 'identity';
  if (await discovery.isVisible().catch(() => false)) return 'discovery';
  if (await gameOver.isVisible().catch(() => false)) return 'gameover';

  await page.getByTestId('narration').waitFor({ state: 'visible', timeout: 15000 });
  await page.getByTestId('choices').locator('button').first().waitFor({ state: 'visible', timeout: 15000 });
  return 'scene';
}

async function clickNeutralChoice() {
  const neutralPattern =
    /Stand a while at the threshold|Linger at the frozen fork|Share her water and rest|Bargain at the threshold|Mark the omen and move on|Watch the reflection a moment|Walk past the fire|Turn from the pool/i;
  const match = page.getByRole('button', { name: neutralPattern });
  if ((await match.count()) > 0) {
    await match.first().click();
    return;
  }
  await page.getByTestId('choices').locator('button').nth(2).click();
}

async function clickStrongestYangChoice() {
  const yangPattern =
    /(?:Roll the dice to )?(Stride boldly|Feed the brazier|Stoke it further|Press on across|Will the sun to hold|Take the quick east|Enter, surrender|Welcome the foreseen dawn|Turn from the pool|Claw back toward the failing light|Let the lurch carry you into day|Open your eyes to the sudden gold)/i;
  const match = page.getByRole('button', { name: yangPattern });
  if ((await match.count()) > 0) {
    await match.first().click();
    return;
  }
  await page.getByTestId('choices').locator('button').first().click();
}

console.log(`Navigating to ${BASE_URL} (mobile ${VIEWPORT.width}×${VIEWPORT.height})...`);
await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.evaluate(() => localStorage.removeItem('solstice-vigil-save'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

await capture('title-screen', { role: 'Try demo mode' });
await page.getByRole('button', { name: /Try demo mode/i }).click();
await page.waitForTimeout(1200);
await waitForScene();

await capture('first-scene', { testId: 'choice-dice' });
const hasDice = (await page.getByTestId('choice-dice').count()) > 0;
if (hasDice) {
  await page.getByTestId('choice-dice').click();
  await page.waitForTimeout(400);
  await capture('dice-roll', null);
  await page.getByTestId('dice-reveal').waitFor({ state: 'hidden', timeout: 8000 });
} else {
  await clickStrongestYangChoice();
  await waitForScene();
}

await page.getByTestId('encounter-discovery-screen').waitFor({ state: 'visible', timeout: 15000 });
await capture('encounter-discovery', { testId: 'encounter-continue' });
await page.getByTestId('encounter-continue').click();
await page.waitForTimeout(800);
await waitForScene();

await capture('encounter-scene', { choiceIdx: 0 });
await page.getByTestId('choices').locator('button').first().click();
await waitForScene();

for (let i = 0; i < 3; i++) {
  if (await page.getByTestId('identity-reveal-screen').isVisible().catch(() => false)) break;

  await capture(`balance-${i}`, { choiceIdx: 2 });
  await clickNeutralChoice();

  const mode = await waitForScene();
  if (mode === 'identity') break;
}

await page.getByTestId('identity-reveal-screen').waitFor({ state: 'visible', timeout: 15000 });
await capture('identity-reveal', { testId: 'identity-continue' });
await page.getByTestId('identity-continue').click();
await page.getByTestId('identity-reveal-screen').waitFor({ state: 'hidden', timeout: 15000 });
await page.waitForTimeout(800);
await waitForScene();

await capture('identity-badge', { choiceIdx: 0 });

for (let i = 0; i < 6; i++) {
  if (await page.getByTestId('gameover-screen').isVisible().catch(() => false)) break;
  await capture(`push-${i}`, { choiceIdx: 0 });
  await clickStrongestYangChoice();
  const next = await waitForScene().catch(() => 'scene');
  if (next === 'gameover') break;
}

if (await page.getByTestId('gameover-screen').isVisible().catch(() => false)) {
  await capture('game-over', { role: 'Begin again' });
  const beginBtn = page.getByRole('button', { name: /Begin again/i });
  if (await beginBtn.isVisible()) {
    await beginBtn.click();
    await page.waitForTimeout(1200);
  }
}

await capture('closing', null);

const metadata = {
  viewport: VIEWPORT,
  frames: frames.map((f) => ({
    file: f.filename,
    stepName: f.stepName,
    clickTarget: f.clickTarget,
    state: {
      title: f.state.title,
      text: f.state.text?.substring(0, 240) || '',
      h2text: f.state.h2text?.substring(0, 120) || '',
      day: f.state.day,
      balance: f.state.balance,
      detail: f.state.detail,
      warning: f.state.warning,
      meterLeft: f.state.meterLeft,
    },
    btnPositions: f.state.btnData,
  })),
};

writeFileSync(resolve(__dirname, 'metadata-mobile.json'), JSON.stringify(metadata, null, 2));
console.log(`\nCaptured ${frames.length} frames → metadata-mobile.json`);

await browser.close();
