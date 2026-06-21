import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRAMES_DIR = resolve(__dirname, 'frames');
const OUTPUT_DIR = resolve(__dirname, 'rendered');
mkdirSync(OUTPUT_DIR, { recursive: true });

const metadata = JSON.parse(readFileSync(resolve(__dirname, 'metadata.json'), 'utf-8'));
const { viewport, frames } = metadata;
const W = viewport.width;
const H = viewport.height;

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function lerp(a, b, t) { return a + (b - a) * t; }

function easeInOut(t) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Subtitle plan: [stepName, lines, durationSec, showCursor]
const SUBTITLE_PLAN = [
  ['title-screen', [
    'SOLSTICE VIGIL',
    'A solo narrative RPG about maintaining balance in a world where time has broken.',
  ], 5, true],
  ['click-demo', [
    'The sun stopped setting at the June solstice.',
    'You keep the wheel of day and night turning.',
  ], 3, false],
  ['first-scene', [
    'Every scene offers a choice.',
    'Each choice shifts the balance between the Long Day (☀) and the Hush (🌙).',
  ], 4, true],
  ['push-0', [
    'Embrace the light — warmth, action, passion.',
    'The meter moves. The world responds.',
  ], 3, true],
  ['push-1', [
    'Deeper into the Long Day.',
    'Stray too far and you become a Sun-Walker.',
  ], 3, true],
  ['game-over', [
    'The vigil ends. The sun will not set.',
    'But you can always begin again.',
  ], 4, false],
  ['restarted', [
    'SOLSTICE VIGIL',
    'Balance instead of victory. Transformation instead of death.',
    'The wheel keeps turning.',
  ], 4, false],
];

// Where buttons are for each scene (index into choice buttons, skipping "restart")
function getTargetButton(frameData) {
  if (!frameData.btnPositions) return null;
  const choices = frameData.btnPositions.filter(b => b.text !== 'restart');
  if (frameData.clickTargetIdx >= 0 && frameData.clickTargetIdx < choices.length) {
    return choices[frameData.clickTargetIdx];
  }
  return null;
}

// Generate a smooth cursor path with slight wobble
function cursorPath(prevX, prevY, targetX, targetY, numFrames, withClick) {
  const points = [];
  const controlX = (prevX + targetX) / 2 + (targetX - prevX) * 0.1;
  const controlY = Math.min(prevY, targetY) - 40; // arc upward
  
  for (let i = 0; i < numFrames; i++) {
    const t = i / (numFrames - 1);
    const et = easeInOut(t);
    
    // Bezier-like quadratic
    let cx = lerp(lerp(prevX, controlX, et), lerp(controlX, targetX, et), et);
    let cy = lerp(lerp(prevY, controlY, et), lerp(controlY, targetY, et), et);
    
    // Add slight wobble (sine wave perpendicular to direction)
    const wobbleAmp = Math.sin(t * Math.PI) * 3;
    const wobblePhase = t * 12;
    const perpX = -(targetY - prevY);
    const perpY = (targetX - prevX);
    const len = Math.sqrt(perpX * perpX + perpY * perpY) || 1;
    cx += (perpX / len) * wobbleAmp * Math.sin(wobblePhase);
    cy += (perpY / len) * wobbleAmp * Math.sin(wobblePhase);
    
    // Click phase: overshoot and settle
    if (withClick && t > 0.7) {
      const ct = (t - 0.7) / 0.3;
      const settle = easeOutBack(Math.min(ct * 2, 1));
      cx = lerp(targetX, cx, 1 - settle * 0.3);
      cy = lerp(targetY, cy, 1 - settle * 0.3);
    }
    
    // In the final 15% of frames, snap to target with click animation
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

function buildCursorSVG(cursorX, cursorY, isClicking, clickProgress, showCursor) {
  if (!showCursor) return '';

  let svg = `<g transform="translate(${cursorX}, ${cursorY})">`;
  
  // Standard arrow cursor shape (matches macOS/Windows pointer)
  // Tip at (0,0), rotated slightly
  svg += `<g transform="rotate(18)">
    <path d="M0,0 L18,14 L11,14 L15,28 L12,29 L8,17 L0,0 Z" 
          fill="white" stroke="#111" stroke-width="1.5" stroke-linejoin="round"
          filter="url(#cursorGlow)"/>
  </g>`;
  
  // Click ripple
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
  
  svg += `</g>`;
  return svg;
}

function buildSubtitleSVG(lines) {
  const lineHeight = 28;
  const barPad = 18;
  const barH = lines.length * lineHeight + barPad * 2 - 4;
  const barY = H - barH - 20;
  const maxLineWidth = W - 160;
  
  const bubbleW = Math.min(maxLineWidth, 
    lines.reduce((m, l) => Math.max(m, l.length * 10 + 40), 300));
  const bubbleX = (W - bubbleW) / 2;
  
  let svg = '';
  
  // Bubble background
  svg += `<rect x="${bubbleX}" y="${barY}" width="${bubbleW}" height="${barH}" 
           rx="14" ry="14" fill="rgba(0,0,0,0.85)" filter="url(#bubbleShadow)"/>`;

  // Text lines
  lines.forEach((line, i) => {
    const ty = barY + barPad + i * lineHeight + 10;
    const isTitle = i === 0 && line === line.toUpperCase();
    const color = isTitle ? '#FFD700' : '#F0F0F0';
    const fw = isTitle ? '700' : '400';
    const fs = isTitle ? '17' : '16';
    svg += `<text x="${W / 2}" y="${ty}" text-anchor="middle" fill="${color}" 
             font-weight="${fw}" font-family="system-ui, -apple-system, sans-serif" 
             font-size="${fs}px">${escapeXml(line)}</text>`;
  });
  
  return svg;
}

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

  // Pre-render base images (screenshot + subtitle bubble baked in)
  // Then render cursor animation frames on top
  const FPS = 30;
  const BASE_DIR = resolve(__dirname, 'base');
  mkdirSync(BASE_DIR, { recursive: true });
  
  console.log('Rendering base frames (subtitles baked in)...');
  for (let si = 0; si < sequence.length; si++) {
    const { frame, subtitle } = sequence[si];
    const sourcePath = resolve(FRAMES_DIR, frame.file);
    
    const svg = buildSubtitleSVG(subtitle);
    const fullSvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="bubbleShadow">
          <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="rgba(0,0,0,0.6)"/>
        </filter>
      </defs>
      ${svg}
    </svg>`;
    
    const result = await sharp(sourcePath)
      .composite([{ input: Buffer.from(fullSvg), top: 0, left: 0 }])
      .png()
      .toBuffer();
    
    writeFileSync(resolve(BASE_DIR, `scene-${String(si).padStart(2, '0')}.png`), result);
    if ((si + 1) % 5 === 0 || si === sequence.length - 1) {
      console.log(`  ${si + 1}/${sequence.length}`);
    }
  }

  // Now generate cursor animated frames
  // Cursor animation state — start from center of screen
  let prevCursorX = W / 2;
  let prevCursorY = H / 2;
  let cursorVisible = false;
  let lastCursorWasVisible = true; // start visible from center
  
  console.log('Generating cursor animation frames...');
  let globalFrameIndex = 0;
  
  for (let si = 0; si < sequence.length; si++) {
    const { frame, duration, showCursor } = sequence[si];
    const totalFrames = Math.round(duration * FPS);
    const basePath = resolve(BASE_DIR, `scene-${String(si).padStart(2, '0')}.png`);
    const baseImg = await sharp(basePath).png().toBuffer();
    
    // Determine target button
    const target = showCursor ? getTargetButton(frame) : null;
    
    // Animate cursor: if this scene shows cursor but previous didn't, 
    // sweep in from left; if both show cursor, move from prev position
    let startX, startY;
    if (showCursor) {
      if (!lastCursorWasVisible) {
        // First appearance: sweep in from left, outside frame
        startX = -40;
        startY = target ? target.y : H / 2;
      } else {
        startX = prevCursorX;
        startY = prevCursorY;
      }
    }
    
    // Generate cursor path for this scene
    let endX = startX || W / 2;
    let endY = startY || H / 2;
    if (target) {
      endX = Math.round(target.x);
      endY = Math.round(target.y);
    }
    
    // How many frames for cursor motion vs settled
    const hasValidTarget = showCursor && target;
    const motionFrames = hasValidTarget ? Math.floor(totalFrames * 0.7) : 0;
    const settleFrames = hasValidTarget ? totalFrames - motionFrames : 0;
    
    // Build motion path
    let path = [];
    if (showCursor && target) {
      path = cursorPath(startX, startY, endX, endY, motionFrames, true);
    }
    
    // Create SVG defs once
    const defs = `<defs>
      <filter id="cursorGlow">
        <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#FFD700" flood-opacity="0.9"/>
      </filter>
    </defs>`;
    
    // Render motion frames
    for (let fi = 0; fi < motionFrames; fi++) {
      const pt = path[fi];
      const cursorSvg = buildCursorSVG(pt.x, pt.y, pt.isClicking, pt.clickProgress, true);
      const fullFrame = defs + cursorSvg;
      
      const result = await sharp(baseImg)
        .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fullFrame}</svg>`), top: 0, left: 0 }])
        .png()
        .toBuffer();
      
      writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), result);
      globalFrameIndex++;
      
      // Update prev position at last frame
      if (fi === motionFrames - 1) {
        prevCursorX = pt.x;
        prevCursorY = pt.y;
        cursorVisible = showCursor;
      }
    }
    
    // Settle frames (cursor stays at end position with subtle idle animation)
    for (let fi = 0; fi < settleFrames; fi++) {
      const idleT = fi / Math.max(settleFrames - 1, 1);
      const idleWobble = Math.sin(idleT * Math.PI * 0.5) * 1.5;
      const cursorSvg = buildCursorSVG(
        endX + idleWobble, 
        endY + Math.cos(idleT * Math.PI * 0.3) * 1, 
        true, 1 - idleT * 0.3, showCursor
      );
      const fullFrame = defs + cursorSvg;
      
      const result = await sharp(baseImg)
        .composite([{ input: Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${fullFrame}</svg>`), top: 0, left: 0 }])
        .png()
        .toBuffer();
      
      writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), result);
      globalFrameIndex++;
      
      if (fi === settleFrames - 1) {
        prevCursorX = endX;
        prevCursorY = endY;
      }
    }
    
    // For scenes without cursor, just output base frames
    if (!showCursor) {
      for (let fi = 0; fi < totalFrames; fi++) {
        writeFileSync(resolve(OUTPUT_DIR, `frame-${String(globalFrameIndex).padStart(5, '0')}.png`), baseImg);
        globalFrameIndex++;
      }
      cursorVisible = false;
    }
    
    lastCursorWasVisible = showCursor;
    
    if ((si + 1) % 3 === 0 || si === sequence.length - 1) {
      console.log(`  Scene ${si + 1}/${sequence.length}: ${globalFrameIndex} total frames`);
    }
  }

  // Build concat file (ffmpeg with image sequence)
  const totalFrames = globalFrameIndex;
  console.log(`Total frames: ${totalFrames}, encoding...`);
  
  // Use image sequence input
  execSync(
    `ffmpeg -y -framerate ${FPS} -i '${OUTPUT_DIR}/frame-%05d.png' ` +
    `-c:v libx264 -pix_fmt yuv420p -r ${FPS} ` +
    `-preset medium -crf 18 '${resolve(__dirname, 'solstice-vigil-demo.mp4')}'`,
    { stdio: 'inherit', shell: true }
  );

  console.log(`\nDone: ${resolve(__dirname, 'solstice-vigil-demo.mp4')}`);
  console.log(`Size: ${(readFileSync(resolve(__dirname, 'solstice-vigil-demo.mp4')).length / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(console.error);
