import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'frames-mobile');
const OUTPUT_DIR = resolve(__dirname, 'rendered-mobile');
mkdirSync(OUTPUT_DIR, { recursive: true });

const metadata = JSON.parse(readFileSync(resolve(__dirname, 'metadata-mobile.json'), 'utf-8'));
const { viewport, frames } = metadata;
const SW = viewport.width;   // screen width (390)
const SH = viewport.height;  // screen height (844)

// Phone frame dimensions
const BEZEL = 18;
const FW = SW + BEZEL * 2;   // frame width  (426)
const FH = SH + BEZEL * 2;   // frame height (880)
const RADIUS = 32;

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function cursorPath(prevX, prevY, targetX, targetY, numFrames, withClick) {
  const points = [];
  const controlY = Math.min(prevY, targetY) - 30;
  for (let i = 0; i < numFrames; i++) {
    const t = i / (numFrames - 1);
    const et = easeInOut(t);
    let cx = lerp(lerp(prevX, (prevX + targetX) / 2, et), lerp((prevX + targetX) / 2, targetX, et), et);
    let cy = lerp(lerp(prevY, controlY, et), lerp(controlY, targetY, et), et);
    const wobbleAmp = Math.sin(t * Math.PI) * 2.5;
    const perpX = -(targetY - prevY);
    const perpY = (targetX - prevX);
    const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    cx += (perpX / len) * wobbleAmp * Math.sin(t * 10);
    cy += (perpY / len) * wobbleAmp * Math.sin(t * 10);
    const isClicking = withClick && t > 0.85;
    const clickProgress = withClick ? Math.min((t - 0.85) / 0.15, 1) : 0;
    points.push({
      x: isClicking ? targetX : cx,
      y: isClicking ? targetY : cy,
      isClicking, clickProgress,
    });
  }
  return points;
}

function buildCursorSVG(cx, cy, isClicking, clickProgress, showCursor) {
  if (!showCursor) return '';
  let svg = `<g transform="translate(${cx}, ${cy})">`;
  svg += `<g transform="rotate(18)">`;
  svg += `<path d="M0,0 L18,14 L11,14 L15,28 L12,29 L8,17 L0,0 Z" fill="white" stroke="#111" stroke-width="1.5" stroke-linejoin="round" filter="url(#cursorGlow)"/>`;
  svg += `</g>`;
  if (isClicking) {
    const rippleR = 6 + clickProgress * 28;
    const rippleO = Math.max(0, 1 - clickProgress * 1.2);
    svg += `<circle cx="0" cy="0" r="${rippleR}" fill="none" stroke="#FFD700" stroke-width="2.5" opacity="${rippleO.toFixed(2)}"/>`;
    if (clickProgress < 0.3) {
      const flashO = 1 - clickProgress / 0.3;
      svg += `<circle cx="0" cy="0" r="20" fill="#FFD700" opacity="${(flashO * 0.25).toFixed(2)}"/>`;
    }
  }
  svg += `</g>`;
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

function buildPhoneFrame(screenX, screenY) {
  return `<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="phoneShadow"><feDropShadow dx="0" dy="6" stdDeviation="12" flood-color="rgba(0,0,0,0.5)"/></filter>
      <filter id="bubbleShadow"><feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="rgba(0,0,0,0.5)"/></filter>
      <filter id="cursorGlow"><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#FFD700" flood-opacity="0.9"/></filter>
      <clipPath id="screenClip"><rect x="${BEZEL}" y="${BEZEL}" width="${SW}" height="${SH}" rx="0"/></clipPath>
    </defs>
    <!-- Phone body -->
    <rect x="0" y="0" width="${FW}" height="${FH}" rx="${RADIUS}" ry="${RADIUS}" fill="#1a1a1a" filter="url(#phoneShadow)"/>
    <!-- Thin metallic border -->
    <rect x="0.5" y="0.5" width="${FW-1}" height="${FH-1}" rx="${RADIUS}" ry="${RADIUS}" fill="none" stroke="#333" stroke-width="1"/>
    <!-- Side buttons (tiny) -->
    <rect x="0" y="160" width="3" height="50" rx="1" fill="#222"/>
    <rect x="0" y="220" width="3" height="60" rx="1" fill="#222"/>
    <rect x="${FW-3}" y="200" width="3" height="70" rx="1" fill="#222"/>
    <!-- Screen background (black) -->
    <rect x="${BEZEL}" y="${BEZEL}" width="${SW}" height="${SH}" rx="0" fill="#000"/>
    <!-- Dynamic island -->
    <rect x="${FW/2-45}" y="${BEZEL+6}" width="90" height="22" rx="11" ry="11" fill="#000"/>
    <!-- Home indicator -->
    <rect x="${FW/2-60}" y="${FH-BEZEL-10}" width="120" height="4" rx="2" ry="2" fill="#444"/>
  </svg>`;
}

function getTargetButton(frameData) {
  if (!frameData.btnPositions) return null;
  const choices = frameData.btnPositions.filter(b => b.text !== 'restart');
  if (frameData.clickTargetIdx >= 0 && frameData.clickTargetIdx < choices.length) {
    return choices[frameData.clickTargetIdx];
  }
  return null;
}

const SUBTITLE_PLAN = [
  ['title-screen', [
    'SOLSTICE VIGIL',
    'A solo narrative RPG about balance in a broken world.',
  ], 5, true],
  ['click-demo', [
    'The sun stopped setting at the June solstice.',
    'You keep the wheel of day and night turning.',
  ], 3, false],
  ['first-scene', [
    'Every scene offers a choice.',
    'Each choice shifts the balance between day and night.',
  ], 4, true],
  ['push-0', [
    'Embrace the light — warmth, action, passion.',
    'The meter moves. The world responds.',
  ], 3, true],
  ['push-1', [
    'Push toward the Long Day.',
    'Stray too far and you become a Sun-Walker.',
  ], 3, true],
  ['push-2', [
    'The balance tips. The wheel turns.',
    'Sink too deep and you become a Night-Walker.',
  ], 3, true],
  ['game-over', [
    'The vigil ends.',
    'But you can always begin again.',
  ], 4, false],
  ['restarted', [
    'SOLSTICE VIGIL',
    'Balance instead of victory. Transformation instead of death.',
    'The wheel keeps turning.',
  ], 4, false],
];

const FPS = 30;

async function main() {
  // Build sequence
  const sequence = [];
  for (const [stepName, lines, duration, showCursor] of SUBTITLE_PLAN) {
    const match = frames.filter(f => f.stepName === stepName);
    if (match.length > 0) {
      sequence.push({ frame: match[0], subtitle: lines, duration, showCursor });
    } else {
      console.warn(`  Missing: "${stepName}"`);
    }
  }

  // Pre-render phone frame base
  const phoneFrameSVG = buildPhoneFrame();
  const phoneFrameImg = await sharp(Buffer.from(phoneFrameSVG)).png().toBuffer();

  console.log('Rendering frames inside phone frame...');

  let prevCursorX = SW / 2;
  let prevCursorY = SH / 2;
  let lastCursorWasVisible = true;
  let globalFrameIndex = 0;

  for (let si = 0; si < sequence.length; si++) {
    const { frame, subtitle, duration, showCursor } = sequence[si];
    const sourcePath = resolve(FRAMES_DIR, frame.file);
    const totalFrames = Math.round(duration * FPS);
    
    // Read and resize screenshot to screen dimensions
    const screenImg = await sharp(sourcePath).resize(SW, SH, { fit: 'fill' }).png().toBuffer();
    
    // Composite screenshot into phone frame
    const withScreen = await sharp(phoneFrameImg)
      .composite([{ input: screenImg, top: BEZEL, left: BEZEL }])
      .png()
      .toBuffer();

    // Add subtitle bubble to base
    const subtitleSVG = buildSubtitleSVG(subtitle);
    const baseWithSubtitle = await sharp(withScreen)
      .composite([{ input: Buffer.from(`<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">${subtitleSVG}</svg>`), top: 0, left: 0 }])
      .png()
      .toBuffer();

    // Cursor animation
    const target = showCursor ? getTargetButton(frame) : null;
    const hasValidTarget = showCursor && target;
    
    let startX, startY;
    if (hasValidTarget) {
      if (!lastCursorWasVisible) {
        startX = -40;
        startY = target.y;
      } else {
        startX = prevCursorX;
        startY = prevCursorY;
      }
    }

    let endX = startX || SW / 2;
    let endY = startY || SH / 2;
    if (target) { endX = Math.round(target.x); endY = Math.round(target.y); }

    const motionFrames = hasValidTarget ? Math.floor(totalFrames * 0.7) : 0;
    const settleFrames = hasValidTarget ? totalFrames - motionFrames : 0;
    let path = [];
    if (hasValidTarget) path = cursorPath(startX, startY, endX, endY, motionFrames, true);

    // Render motion frames
    for (let fi = 0; fi < motionFrames; fi++) {
      const pt = path[fi];
      const cursorSVG = buildCursorSVG(pt.x, pt.y, pt.isClicking, pt.clickProgress, true);
      const frameImg = await sharp(baseWithSubtitle)
        .composite([{ input: Buffer.from(`<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">${cursorSVG}</svg>`), top: 0, left: 0 }])
        .png()
        .toBuffer();
      writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), frameImg);
      globalFrameIndex++;
      if (fi === motionFrames - 1) { prevCursorX = pt.x; prevCursorY = pt.y; }
    }

    // Settle frames
    for (let fi = 0; fi < settleFrames; fi++) {
      const idleT = fi / Math.max(settleFrames - 1, 1);
      const wobble = Math.sin(idleT * Math.PI * 0.5) * 1.5;
      const cursorSVG = buildCursorSVG(endX + wobble, endY + Math.cos(idleT * Math.PI * 0.3) * 1, true, 1 - idleT * 0.3, showCursor);
      const frameImg = await sharp(baseWithSubtitle)
        .composite([{ input: Buffer.from(`<svg width="${FW}" height="${FH}" xmlns="http://www.w3.org/2000/svg">${cursorSVG}</svg>`), top: 0, left: 0 }])
        .png()
        .toBuffer();
      writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), frameImg);
      globalFrameIndex++;
      if (fi === settleFrames - 1) { prevCursorX = endX; prevCursorY = endY; }
    }

    // No-cursor scenes
    if (!hasValidTarget) {
      for (let fi = 0; fi < totalFrames; fi++) {
        writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), baseWithSubtitle);
        globalFrameIndex++;
      }
      lastCursorWasVisible = false;
    } else {
      lastCursorWasVisible = showCursor;
    }

    if ((si + 1) % 3 === 0 || si === sequence.length - 1) {
      console.log(`  Scene ${si + 1}/${sequence.length}: ${globalFrameIndex} frames`);
    }
  }

  console.log(`Total: ${globalFrameIndex} frames. Encoding...`);
  execSync(
    `ffmpeg -y -framerate ${FPS} -i '${OUTPUT_DIR}/frame-%05d.png' ` +
    `-c:v libx264 -pix_fmt yuv420p -r ${FPS} -preset medium -crf 18 ` +
    `'${resolve(__dirname, 'solstice-vigil-demo-mobile.mp4')}'`,
    { stdio: 'inherit', shell: true }
  );

  console.log(`\nDone: ${resolve(__dirname, 'solstice-vigil-demo-mobile.mp4')}`);
  console.log(`Size: ${(readFileSync(resolve(__dirname, 'solstice-vigil-demo-mobile.mp4')).length / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
