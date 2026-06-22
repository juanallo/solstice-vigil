import { spawnSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function run(label, script) {
  console.log(`\n=== ${label} ===\n`);
  const result = spawnSync('node', [resolve(__dirname, script)], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('Capture gameplay frames', 'demo.mjs');
run('Render subtitles + cursor', 'render.mjs');
