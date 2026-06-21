This file provides guidance when working with code in this repository. The README.md should ALWAYS serve as an accurate, comprehensive piece of documentation for this project. It should describe the broader goals and purpose of this repository along with the technical implementation details. If any aspect of the project changes, the README.md should be updated to reflect that.

# Project Notes

<!-- Documentation for this specific project goes here. -->
## SOLSTICE VIGIL — a never-ending solo RPG for the DEV June Solstice Game Jam

A single-player, never-ending roleplaying game built for the [DEV June Solstice Game Jam](https://dev.to/devteam/join-the-june-solstice-game-jam-1000-in-prizes-3jla). The world has frozen at the June solstice — the longest day — and a lone wanderer must keep the wheel of day and night turning, forever. It never ends: leaning too far into the light transforms you into a **sun-walker**; sinking too far into the Hush transforms you into a **night-walker**. Neither ends you. The vigil turns. The wheel does not stop.

**Solo mode + on-device LLM.** Each scene is narrated live on the player's own device by **Gemma 4 (E2B)** running in the browser via **Google AI Edge LiteRT-LM** (WebGPU) — no server, no API key, no data leaves the machine. This targets the jam's "Best Google AI Usage" and "Solo Mode" criteria.

### Core loop & mechanics
- **Day ↔ Night cycle (yin/yang).** A `balance` meter (−100 eternal Day → +100 eternal Night) is the central clock (inspired by Stillpoint OSR's Hush meter). Every 5 turns the phase flips (Long Day ↔ Hush of Night); each completed cycle scores a "vigil endured."
- **Five scene archetypes** (LLM-rendered, with hand-written fallbacks):
  - **Threshold** — a bold binary choice (big yang vs big yin).
  - **Wanderer** — a trade: one costly option, two smaller ones.
  - **Omen** — small shifts that foreshadow the coming phase.
  - **Temptation** — biased toward the *current* phase (draws you deeper in).
  - **Lurch** — a forced crisis that breaks stagnation (Stillpoint's "the world remembers risk").
- **Stagnation → Lurch.** Three same-tone choices in a row anger the solstice and force a Lurch — the world lurches against your stillness.
- **Transformation, not death.** Hitting ±100 doesn't end the game: you gain an aspect (sun-walker/night-walker), `transformations++`, balance resets toward the opposite pole, and the vigil continues. This is how "never-ending" keeps stakes without a game-over.

### Architecture decision: JS owns state, LLM narrates
The LLM is **never** the source of truth. All game state (cycle, turn, phase, balance, score, aspects, history) is owned in JS and persisted to `localStorage`. Each turn the engine sends the LLM a compact state summary + an archetype to render, parses a strict JSON response (`{narration, actions[{label, balanceShift, tone}]}`), clamps the proposed shifts to per-archetype bounds, and falls back to hand-written scenes on any parse/streaming failure. This makes the game robust to model hiccups and fully replayable.

### Demo mode (essential for judges)
The E2B model is ~2 GB (verified via HEAD: `gemma-4-E2B-it-litert-lm` on HuggingFace, ~2,008,432,640 bytes). First load fetches & caches it via the Cache API. Because a 2 GB download + WebGPU is a high bar for jam judges, **demo mode** plays the *entire* game loop using the hand-written scenes — no AI, no download, instant. Entry points: the "Try demo mode" button on the title screen, the `?demo=1` URL param, or the "skip to demo mode" link on the loading screen. If WebGPU is missing, the nosupport screen offers demo mode directly.

### Model download robustness (magic-number validation)
The LiteRT-LM model file begins with the 8-byte magic `LITERTLM`. If a download is interrupted or the network returns an HTML error/interstitial page, feeding that blob to `Engine.create()` throws `Invalid magic number. Expected 'LITERTLM', got '<!DOCTYP'`. To prevent this, `fetchModel` validates the blob's first 8 bytes via `isValidModelBlob()` on **both** paths:
- **Cache hit:** if the cached blob fails the magic check (a corrupt/interrupted earlier download), the cache entry is evicted (`cache.delete`) and a fresh fetch starts automatically — the player never sees the error.
- **Fresh fetch:** if the streamed bytes don't begin with `LITERTLM` (e.g. a proxy returned HTML), a clear error is thrown pointing the player to retry or play in demo mode.
The model URL also uses `?download=true` to force the binary disposition and avoid any HTML interstitial. Verified by injecting a `<!DOCTYPE html>` blob into the Cache API and confirming Begin evicts it and starts a real download instead of erroring.

### Tech stack
- **React 19 + Vite + Tailwind 4** (Zo Site scaffold). The whole game is one self-contained file: `src/SolsticeVigil.tsx` (~464 lines), rendered directly from `src/App.tsx` (with a React ErrorBoundary). Router/ThemeProvider are bypassed — the component owns its colors inline and transitions the background gradient between day/night palettes.
- **On-device LLM:** `@litert-lm/core` loaded via CDN ESM (`cdn.jsdelivr.net`), Gemma 4 E2B model from `huggingface.co/litert-community`. Streaming responses via `conversation.sendMessageStreaming()`.
- **Persistence:** `localStorage` (`solstice-vigil-save`); model blob cached via Cache API (`solstice-vigil`).

### File map
- `src/SolsticeVigil.tsx` — the entire game (constants, types, SYSTEM_PROMPT, 10 hand-written fallback scenes, helpers, the `SolsticeVigil` component with all 6 screens: title / loading / nosupport / error / transforming / playing).
- `src/App.tsx` — renders `SolsticeVigil` inside an `ErrorBoundary`.
- Source backup also at `Projects/solstice-vigil/SolsticeVigil.tsx` (user workspace).

### Verified mechanics (demo-mode playthrough)
Confirmed end-to-end: scene rendering (day + night variants), HUD (cycle/phase/vigils/meter/balance/demo badge/aspects), action→balance arithmetic, archetype variety + no-immediate-repeat, stagnation→Lurch (triggered in both day and night), phase flip at turn 5 (day→night), visual day↔night palette transition, transformation at |balance|≥100 (night-walker), and resume-after-transformation (balance resets, aspect gained, game continues).

### Known limitations / jam notes
- The live Gemma path can't be exercised in headless automation (2 GB download + WebGPU); demo mode proves the full loop, and the LLM path is covered by streaming + JSON-parse + retry + fallback.
- Quote tweets not relevant. No multiplayer (solo by design).
- TODO for submission: demo video + DEV community post (deferred per user — "just do the game for now").

---

# Documentation

This is a **Zo Site** - a web application running on a user's Zo computer that combines:
- **Backend**: Bun + Hono server with API routes
- **Frontend**: React + Vite with client-side routing, shadcn/ui components, and Tailwind CSS 4
- **Single Process**: Vite runs in middleware mode (no separate dev server)

## Architecture

### File Structure

```
.
├── server.ts              # Main server (Hono + Vite middleware)
├── index.html             # HTML entry point for React
├── vite.config.ts         # Vite configuration
├── package.json           # Dependencies and scripts
├── zosite.json            # Zo deployment config (ports, env vars)
├── public/                # Static assets (images, fonts, favicon)
│   ├── favicon.svg        # Site favicon (replace with your own)
│   └── images/
│       └── pegasus.png    # Example image (loaded via <img src="/images/pegasus.png">)
├── backend-lib/
│   └── zo-api.ts         # Helper for calling Zo API
└── src/
    ├── main.tsx          # React entry point
    ├── App.tsx           # Router setup
    ├── styles.css        # Global styles
    └── pages/            # Page components
```

### Development vs Production

**Development Mode** (`bun run dev`):
- Single Bun process running `server.ts`
- Vite in middleware mode transforms files on-the-fly
- API routes: `/api/*` handled by Hono
- React app: served via Vite transforms (HMR disabled, use `bun --hot` for server restart)
- Client-side routing: any non-API, non-file route falls back to `index.html`
- **Environment**: Site runs at an internal authenticated URL accessible only to you (private site on your Zo computer)

**Production Mode** (`bun run prod`):
- Builds React app to `dist/` using Vite
- Bun serves static files from `dist/` via `hono/bun` serveStatic
- API routes still handled by Hono
- SPA fallback: all non-API routes serve `dist/index.html`
- **Environment**: Site is published and accessible to anyone on the internet at a public URL

NEVER use the scripts `bun run dev` or `bun run prod`. The Zo system handles running the site in the correct mode based on context. All process management of the server is handled by Zo. Never restart or stop the server manually.

## Viewing, Verification, and Debugging (agent-browser)

The `agent-browser` CLI tool lets you preview, navigate, and debug the site running at `http://localhost:$PORT` (PORT is set by Zo). Use it to verify UI changes, debug routing, or capture screenshots.

Core workflow:
1. Navigate to the site:
   ```bash
   agent-browser open http://localhost:$PORT
   ```
2. Snapshot the page to get interactive element refs:
   ```bash
   agent-browser snapshot -i
   ```
3. Interact with elements:
   ```bash
   agent-browser click @e1
   agent-browser fill @e2 "text"
   agent-browser hover @e3
   agent-browser get text @e1
   ```
4. Re-snapshot after page changes to get updated refs.

Taking screenshots:
```bash
agent-browser screenshot
agent-browser screenshot --full-page
agent-browser screenshot --filename debug.png
```

For the full list of commands and options, run:
```bash
agent-browser --help
```

Note: Do not tell the user to visit localhost; they already have access via the Zo preview iframe.

## Key Technologies

### ⚠️ IMPORTANT: This is BUN + HONO (NOT Node.js + Express)

This application uses:
- **Bun** as the runtime (NOT Node.js)
- **Hono** as the web framework (NOT Express)

Do not use Express patterns. Use Hono equivalents. For file system operations, see the section below.

### Bun Runtime
- JavaScript runtime (NOT Node.js or Deno)
- Use `bun add <package>` to install dependencies
- Built-in TypeScript support
- Built-in SQLite via `import { Database } from "bun:sqlite"`
- Process spawning: `Bun.spawn()` for running commands

### File System Operations

Bun has native APIs for file I/O but uses Node.js APIs for directory operations. Use the correct API for each operation:

| Operation | API | Example |
|-----------|-----|---------|
| Read file | `Bun.file()` | `await Bun.file("data.json").text()` |
| Write file | `Bun.write()` | `await Bun.write("out.txt", content)` |
| File exists | `Bun.file().exists()` | `await Bun.file("x.txt").exists()` |
| Read directory | `node:fs/promises` | `await readdir("./posts")` |
| Create directory | `node:fs/promises` | `await mkdir("dir", { recursive: true })` |
| Glob files | `Bun Glob` | `new Glob("**/*.md").scan(".")` |

**⚠️ Common Mistakes to Avoid:**

```ts
// ❌ WRONG - These do NOT exist:
Bun.readdir()        // No such API
Bun.readdirSync()    // No such API
Bun.mkdir()          // No such API
fs.readFileSync()    // Works but slower than Bun.file()

// ✅ CORRECT patterns:
import { readdir, mkdir } from "node:fs/promises";

// Reading a file
const content = await Bun.file("config.json").json();

// Writing a file
await Bun.write("output.txt", "Hello");

// Listing directory contents
const files = await readdir("./posts");

// Creating a directory
await mkdir("./uploads", { recursive: true });

// Finding files by pattern
import { Glob } from "bun";
const glob = new Glob("**/*.md");
for await (const file of glob.scan("./posts")) {
  console.log(file);
}
```

### Hono Framework
- Lightweight web framework designed for Bun
- Documentation: https://honojs.dev/llms-small.txt
- Import from `hono` for core, `hono/bun` for Bun-specific features like `serveStatic`

**Serving Static Files (Bun-specific):**

```ts
import { serveStatic } from 'hono/bun'

app.use('/static/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './favicon.ico' }))
app.get('*', serveStatic({ path: './static/fallback.txt' }))

// You can reach outside the project root to files in the user's workspace
app.get('/workspace-file', serveStatic({ path: '../some/dir/file.txt' }))
app.get('/absolute-file', serveStatic({ path: '/home/user/file.txt' }))

// Custom MIME types
app.get('/media/*', serveStatic({
  mimes: {
    m3u8: 'application/vnd.apple.mpegurl',
    ts: 'video/mp2t',
  },
}))
```

**Hono Routing:**

```ts
// REST API endpoints
app.get('/', (c) => c.json({ items: [] }))
app.post('/', (c) => c.json({ created: true }, 201))
app.get('/:id', (c) => c.json({ id: c.req.param('id') }))

// Middleware
import { basicAuth } from 'hono/basic-auth'
app.use('/admin/*', basicAuth({ username: 'admin', password: 'secret' }))

// Multiple middlewares are processed in order
app.use(logger())
app.use('/posts/*', cors())
app.post('/posts/*', basicAuth())
```

### React + Vite
- React for UI components
- Vite handles bundling and transforms
- Dependencies installed via `bun add` (NOT CDN imports) - all packages bundled by Vite
- React Router for client-side routing
- **Styling**: Tailwind CSS 4 configured with `@tailwindcss/vite` plugin
- **UI Components**: shadcn/ui already set up and configured - components can be added via `bunx shadcn@latest add <component-name>`
- **Icons**: Lucide React icons included and ready to use

## Common Tasks

### Adding API Routes

Add routes in `server.ts` before the Vite middleware:

```ts
app.get("/api/example", async (c) => {
  return c.json({ data: "example" });
});
```

### Adding React Components

Create components in `src/`:

```tsx
// src/components/MyComponent.tsx
import React from "react";

export default function MyComponent() {
  return <div>Hello</div>;
}
```

Add routes in `src/App.tsx`:

```tsx
import MyPage from "./pages/MyPage";

<Routes>
  <Route path="/my-page" element={<MyPage />} />
</Routes>
```

### Calling Zo API from Backend

Use the helper in `backend-lib/zo-api.ts`:

```ts
import { callZo } from "./backend-lib/zo-api";

app.post("/api/ask-zo", async (c) => {
  const { question } = await c.req.json();

  const result = await callZo(question, {
    outputFormat: {
      type: "object",
      properties: { answer: { type: "string" } },
      required: ["answer"]
    }
  });

  return c.json(result);
});
```

### Static Assets

There are two ways to include static assets like images, fonts, or JSON data:

#### Option 1: The `public/` Folder (Recommended for Most Cases)

Place files in the `public/` directory. They're served at the root URL path and work identically in dev and production.

```
public/
├── favicon.svg
├── images/
│   ├── logo.png
│   └── hero.jpg
├── fonts/
│   └── custom.woff2
└── og-image.jpg
```

Reference them with absolute paths:

```tsx
<img src="/images/logo.png" alt="Logo" />
<link rel="icon" href="/favicon.svg" />
```

In production, Vite copies the `public/` folder contents to `dist/` automatically.

**Use `public/` for**: favicons, Open Graph images, downloadable files, fonts, any asset that needs a stable/predictable URL.

#### Option 2: Import in Components (Bundled Assets)

Import assets directly in your React components. Vite handles bundling, optimization, and cache-busting via content hashes.

```tsx
// Images
import heroImage from '@/assets/hero.png';

function Hero() {
  return <img src={heroImage} alt="Hero" />;
}

// JSON data
import config from '@/data/config.json';

function Settings() {
  return <div>App version: {config.version}</div>;
}

// SVG as component (with ?react suffix)
import Logo from '@/assets/logo.svg?react';

function Header() {
  return <Logo className="h-8 w-8" />;
}
```

Place imported assets in `src/assets/` or alongside components:

```
src/
├── assets/
│   ├── hero.png
│   └── logo.svg
├── data/
│   └── config.json
└── components/
    └── Header.tsx
```

**Use imports for**: component-specific images, icons used in JSX, JSON configuration, any asset that benefits from bundling/tree-shaking.

#### Serving Files from the Workspace

For files outside the project (e.g., user's workspace files), create an API route:

```ts
app.get("/myfile", async (c) => {
  const file = Bun.file("/path/to/file");
  return new Response(file);
});
```

### Database

This application is database-agnostic and doesn't include a database by default. For most use cases, SQLite is recommended.

**Using Bun's Built-in SQLite:**

```ts
import { Database } from "bun:sqlite";

// Create/open database
const db = new Database("mydb.sqlite");

// Create table
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE
  )
`);

// Insert data
const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
insert.run("John Doe", "john@example.com");

// Query data
const query = db.query("SELECT * FROM users WHERE name = ?");
const users = query.all("John Doe");

// Close when done
db.close();
```

**In a Hono route:**

```ts
app.get("/api/users", (c) => {
  const db = new Database("mydb.sqlite");
  const users = db.query("SELECT * FROM users").all();
  db.close();
  return c.json({ users });
});

app.post("/api/users", async (c) => {
  const { name, email } = await c.req.json();
  const db = new Database("mydb.sqlite");

  try {
    const insert = db.prepare("INSERT INTO users (name, email) VALUES (?, ?)");
    insert.run(name, email);
    db.close();
    return c.json({ success: true }, 201);
  } catch (error) {
    db.close();
    return c.json({ error: "Failed to create user" }, 400);
  }
});
```

## Scripts

- `bunx tsc --noEmit` - Type check

## Important Notes

### Server-Side vs Client-Side

- **Server code**: `server.ts`, `backend-lib/` - runs on Bun
- **Client code**: `src/` - runs in browser, bundled by Vite
- Install ALL dependencies via `bun add` (React, etc.) - Vite bundles them

### Environment Variables

- `NODE_ENV=production` switches to production mode
- `ZO_CLIENT_IDENTITY_TOKEN` required for calling Zo API
- Access server vars via `process.env.VAR_NAME` in server code
- Access client vars prefixed with `VITE_` via `import.meta.env.VITE_VAR_NAME` in React code

### File System Access

The server runs on the user's Zo computer and can:
- Read/write any file on the system
- Execute commands via `Bun.spawn()`
- Access local databases

### Configuration

`zosite.json` defines:
```json
{
  "name": "My Site",
  "local_port": 12345,
  "entrypoint": "bun run dev",
  "publish": {
    "label": "My Site",
    "type": "http",
    "entrypoint": "bun run prod",
    "published_port": 12346,
    "env": {
      "NODE_ENV": "production",
      "ZO_CLIENT_IDENTITY_TOKEN": "none"
    }
  }
}
```

- Top-level `env`: Environment variables for **development mode**
- `publish.env`: Environment variables for **production mode**
- Variables prefixed with `VITE_` are exposed to client-side code via Vite
- `PORT` environment variable is automatically set to match `local_port` (or `published_port` in production)

### ⚠️ IMPORTANT: Do Not Edit `zosite.json` System Fields

**The `zosite.json` file is auto-generated by Zo. Most fields should not be manually edited.**

- `local_port` and `published_port` are assigned by the system when the site is created
- Ports are chosen using a hash-based algorithm to avoid conflicts
- The Zo system manages process lifecycle, tunneling, and URL routing based on these ports
- Editing ports or entrypoints will break the site's preview URL and publish functionality

**Safe to edit:**
- `name` - The display name for the site
- `env` and `publish.env` - Add or modify environment variables as needed

**Never edit:**
- `local_port`, `published_port` - System-assigned ports
- `entrypoint`, `publish.entrypoint` - Managed startup commands
- `label`, `type` - Service configuration

**Private vs Public Access:**
- **Private (default)**: Sites run in dev mode behind authentication. Only you can access them via the preview iframe in Zo. This is the normal development experience.
- **Public (published)**: Publishing creates a shareable URL that anyone on the internet can access without authentication.

To publish your site publicly, use the **Publish button** in the Zo UI or explicitly ask Zo to publish it (e.g., "publish this site", "make it public").

## Deployment

The site exports `{ fetch, port }` from `server.ts` for Zo's deployment system. The same code runs in both dev and production - mode is controlled by `NODE_ENV`.
