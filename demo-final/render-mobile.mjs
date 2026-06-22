import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { execSync } from 'child_process';
import { getTargetButton } from './target-button.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'frames-mobile');
const OUTPUT_DIR = resolve(__dirname, 'rendered-mobile');
const MUSIC = resolve(__dirname, '../music/Vigil_of_the_Still_Valley.mp3');
mkdirSync(OUTPUT_DIR, { recursive: true });

const metadata = JSON.parse(readFileSync(resolve(__dirname, 'metadata-mobile.json'), 'utf-8'));
const { viewport, frames } = metadata;
const SW = viewport.width;
const SH = viewport.height;

const BEZEL = 18;
const FW = SW + BEZEL * 2;
const FH = SH + BEZEL * 2;
const RADIUS = 32;

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function toFrame(x, y) {
  return { x: x + BEZEL, y: y + BEZEL };
}

const SUBTITLE_PLAN = [
  ['title-screen', [
    'SOLSTICE VIGIL',
    'A solo narrative RPG about day and night.',
  ], 5],
  ['first-scene', [
    'Every scene offers a choice.',
    'Bold actions can trigger a d20 roll.',
  ], 4],
  ['dice-roll', [
    'The dice decide how far the balance shifts.',
    'Oracle lines shape the outcome.',
  ], 3.5],
  ['encounter-discovery', [
    'Rare wonders appear with discovery cards.',
    'Fifteen encounters with a codex.',
  ], 4],
  ['encounter-scene', [
    'The Clockmaker offers a bargain.',
    'Your choices are remembered across cycles.',
  ], 3.5],
  ['balance-0', [
    'Each choice nudges the Long Day ↔ Hush meter.',
    'Lean too far and the vigil ends.',
  ], 3.5],
  ['balance-1', [
    'Phase flips between day and night.',
    'Warnings appear when balance grows restless.',
  ], 3.5],
  ['identity-reveal', [
    'Identities are discovered — not chosen.',
    'You become something the world recognizes.',
  ], 4],
  ['identity-badge', [
    'Your title lives in the HUD.',
    'Demo mode — no download, no API key.',
  ], 3.5],
  ['push-0', [
    'Embrace the light — warmth, action, passion.',
    'The meter moves. The world responds.',
  ], 3],
  ['push-1', [
    'Deeper into the Long Day.',
    'Stray too far and you become a Sun-Walker.',
  ], 3],
  ['push-2', [
    'The solstice grows restless.',
    'Balance instead of victory.',
  ], 3],
  ['game-over', [
    'The vigil ends. Share your days endured.',
    'Your wanderer. Your wonders witnessed.',
  ], 4.5],
  ['closing', [
    'SOLSTICE VIGIL',
    'The wheel keeps turning.',
  ], 4],
];

function cursorPath(prevX, prevY, targetX, targetY, numFrames, withClick) {
  const points = [];
  const controlX = (prevX + targetX) / 2 + (targetX - prevX) * 0.1;
  const controlY = Math.min(prevY, targetY) - 30;

  for (let i = 0; i < numFrames; i++) {
    const t = i / Math.max(numFrames - 1, 1);
    const et = easeInOut(t);

    let cx = lerp(lerp(prevX, controlX, et), lerp(controlX, targetX, et), et);
    let cy = lerp(lerp(prevY, controlY, et), lerp(controlY, targetY, et), et);

    const wobbleAmp = Math.sin(t * Math.PI) * 2.5;
    const perpX = -(targetY - prevY);
    const perpY = targetX - prevX;
    const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    cx += (perpX / len) * wobbleAmp * Math.sin(t * 10);
    cy += (perpY / len) * wobbleAmp * Math.sin(t * 10);

    if (withClick && t > 0.7) {
      const ct = (t - 0.7) / 0.3;
      const settle = easeOutBack(Math.min(ct * 2, 1));
      cx = lerp(targetX, cx, 1 - settle * 0.3);
      cy = lerp(targetY, cy, 1 - settle * 0.3);
    }

    const isClicking = withClick && t > 0.85;
    const clickProgress = withClick ? Math.min((t - 0.85) / 0.15, 1) : 0;

    points.push({
      x: isClicking ? targetX : cx,
      y: isClicking ? targetY : cy,
      isClicking,
      clickProgress,
    });
  }
  return points;
}

function buildCursorSVG(cursorX, cursorY, isClicking, clickProgress) {
  let svg = `<g transform="translate(${cursorX}, ${cursorY})">`;
  svg += `<g transform="rotate(18)">
    <path d="M0,0 L18,14 L11,14 L15,28 L12,29 L8,17 L0,0 Z"
          fill="white" stroke="#111" stroke-width="1.5" stroke-linejoin="round"
          filter="url(#cursorGlow)"/>
  </g>`;

  if (isClicking) {
    const rippleR = 6 + clickProgress * 28;
    const rippleO = Math.max(0, 1 - clickProgress * 1.2);
    svg += `<circle cx="0" cy="0" r="${rippleR}" fill="none" stroke="#FFD700"
             stroke-width="2.5" opacity="${rippleO.toFixed(2)}"/>`;
    if (clickProgress < 0.3) {
      const flashO = 1 - clickProgress / 0.3;
      svg += `<circle cx="0" cy="0" r="20" fill="#FFD700" opacity="${(flashO * 0.25).toFixed(2)}"/>`;
    }
  }

  svg += '</g>';
  return svg;
}

function buildSubtitleSVG(lines) {
  const lineHeight = 26;
  const barPad = 14;
  const barH = lines.length * lineHeight + barPad * 2;
  const barY = FH - barH - 16;
  const maxBW = FW - 48;
  const bubbleW = Math.min(maxBW, lines.reduce((m, l) => Math.max(m, l.length * 8.5 + 32), 240));
  const bubbleX = (FW - bubbleW) / 2;

  let svg = `<rect x="${bubbleX}" y="${barY}" width="${bubbleW}" height="${barH}" rx="12" ry="12" fill="rgba(0,0,0,0.85)" filter="url(#bubbleShadow)"/>`;
  lines.forEach((line, i) => {
    const ty = barY + barPad + i * lineHeight + 8;
    const isTitle = i === 0 && line === line.toUpperCase();
    svg += `<text x="${FW / 2}" y="${ty}" text-anchor="middle" fill="${isTitle ? '#FFD700' : '#F0F0F0'}" font-weight="${isTitle ? '700' : '400'}" font-family="system-ui, sans-serif" font-size="${isTitle ? '15' : '14'}px">${escapeXml(line)}</text>`;
  });
  return svg;
}

function buildPhoneFrameSVG() {
  return `<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="phoneShadow"><feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="rgba(0,0,0,0.5)"/></filter>
      <filter id="bubbleShadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.5)"/></filter>
      <filter id="cursorGlow"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#FFD700" flood-opacity="0.9"/></filter>
    </defs>
    <rect x="0" y="0" width="${FW}" height="${FH}" rx="${RADIUS}" ry="${RADIUS}" fill="#1a1a1a" filter="url(#phoneShadow)"/>
    <rect x="0.5" y="0.5" width="${FW - 1}" height="${FH - 1}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="#333" stroke-width="1"/>
    <rect x="0" y="160" width="3" height="50" rx="1" fill="#222"/>
    <rect x="0" y="220" width="3" height="60" rx="1" fill="#222"/>
    <rect x="${FW - 3}" y="200" width="3" height="70" rx="1" fill="#222"/>
    <rect x="${BEZEL}" y="${BEZEL}" width="${SW}" height="${SH}" fill="#000"/>
    <rect x="${FW / 2 - 45}" y="${BEZEL + 6}" width="90" height="22" rx="11" ry="11" fill="#000"/>
    <rect x="${FW / 2 - 60}" y="${FH - BEZEL - 10}" width="120" height="4" rx="2" ry="2" fill="#444"/>
  </svg>`;
}

const FPS = 30;

async function main() {
  const sequence = [];
  for (const [stepName, lines, duration] of SUBTITLE_PLAN) {
    const match = frames.filter((f) => f.stepName === stepName);
    if (match.length > 0) {
      sequence.push({ frame: match[0], subtitle: lines, duration });
    } else {
      console.warn(`  Missing frame: "${stepName}"`);
    }
  }

  const phoneFrameImg = await sharp(Buffer.from(buildPhoneFrameSVG())).png().toBuffer();

  let prevCursorX = SW / 2 + BEZEL;
  let prevCursorY = SH / 2 + BEZEL;
  let globalFrameIndex = 0;

  console.log('Rendering mobile frames (phone frame + subtitles + cursor)...');

  for (let si = 0; si < sequence.length; si++) {
    const { frame, subtitle, duration } = sequence[si];
    const sourcePath = resolve(FRAMES_DIR, frame.file);
    const totalFrames = Math.round(duration * FPS);

    const screenImg = await sharp(sourcePath).resize(SW, SH, { fit: 'fill' }).png().toBuffer();
    const withScreen = await sharp(phoneFrameImg)
      .composite([{ input: screenImg, top: BEZEL, left: BEZEL }])
      .png()
      .toBuffer();

    const subtitleSVG = buildSubtitleSVG(subtitle);
    const baseWithSubtitle = await sharp(withScreen)
      .composite([
        {
          input: Buffer.from(`<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">${subtitleSVG}</svg>`),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    const target = getTargetButton(frame);
    const hasTarget = !!target;

    let endX = prevCursorX;
    let endY = prevCursorY;
    if (hasTarget) {
      const pt = toFrame(target.x, target.y);
      endX = Math.round(pt.x);
      endY = Math.round(pt.y);
    }

    const motionFrames = hasTarget ? Math.floor(totalFrames * 0.65) : Math.floor(totalFrames * 0.35);
    const settleFrames = totalFrames - motionFrames;

    let path = [];
    if (hasTarget && motionFrames > 1) {
      path = cursorPath(prevCursorX, prevCursorY, endX, endY, motionFrames, true);
    } else if (motionFrames > 0) {
      path = Array.from({ length: motionFrames }, (_, i) => ({
        x: prevCursorX + Math.sin(i * 0.15) * 2,
        y: prevCursorY + Math.cos(i * 0.12) * 1.5,
        isClicking: false,
        clickProgress: 0,
      }));
    }

    for (let fi = 0; fi < motionFrames; fi++) {
      const pt = path[fi] ?? { x: endX, y: endY, isClicking: false, clickProgress: 0 };
      const cursorSVG = buildCursorSVG(pt.x, pt.y, pt.isClicking, pt.clickProgress);
      const frameImg = await sharp(baseWithSubtitle)
        .composite([
          {
            input: Buffer.from(`<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">${cursorSVG}</svg>`),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();

      writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), frameImg);
      globalFrameIndex++;
      if (fi === motionFrames - 1) {
        prevCursorX = pt.x;
        prevCursorY = pt.y;
      }
    }

    for (let fi = 0; fi < settleFrames; fi++) {
      const idleT = fi / Math.max(settleFrames - 1, 1);
      const idleWobble = Math.sin(idleT * Math.PI * 0.5) * 1.5;
      const cursorSVG = buildCursorSVG(
        endX + idleWobble,
        endY + Math.cos(idleT * Math.PI * 0.3) * 1,
        hasTarget,
        hasTarget ? 1 - idleT * 0.3 : 0,
      );

      const frameImg = await sharp(baseWithSubtitle)
        .composite([
          {
            input: Buffer.from(`<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">${cursorSVG}</svg>`),
            top: 0,
            left: 0,
          },
        ])
        .png()
        .toBuffer();

      writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), frameImg);
      globalFrameIndex++;
      if (fi === settleFrames - 1) {
        prevCursorX = endX;
        prevCursorY = endY;
      }
    }

    if ((si + 1) % 4 === 0 || si === sequence.length - 1) {
      console.log(`  Scene ${si + 1}/${sequence.length}: ${globalFrameIndex} total frames`);
    }
  }

  const outputMp4 = resolve(__dirname, 'solstice-vigil-demo-final-mobile.mp4');
  console.log(`Total frames: ${globalFrameIndex}. Encoding...`);

  execSync(
    `ffmpeg -y -framerate ${FPS} -i '${OUTPUT_DIR}/frame-%05d.png' ` +
      `-i '${MUSIC}' ` +
      `-c:v libx264 -pix_fmt yuv420p -r ${FPS} ` +
      `-c:a aac -b:a 192k -shortest ` +
      `-preset medium -crf 18 '${outputMp4}'`,
    { stdio: 'inherit', shell: true },
  );

  const sizeMb = (readFileSync(outputMp4).length / 1024 / 1024).toFixed(1);
  console.log(`\nDone: ${outputMp4}`);
  console.log(`Size: ${sizeMb} MB`);
}

main().catch(console.error);
