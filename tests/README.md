# Playwright E2E Tests

These tests validate Solstice Vigil behavior before and after the Astro migration.

## Run locally

```bash
npm run test:e2e
```

This starts the prototype dev server at `http://127.0.0.1:50426` and runs the demo-mode suite.

## Target another server (Astro preview)

Point the same suite at a different build by setting environment variables:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 \
PLAYWRIGHT_WEB_SERVER_COMMAND="npm run preview --prefix astro" \
npm run test:e2e
```

To run against a server you already started:

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 \
npm run test:e2e
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:50426` | Base URL for navigation |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | `cd prototype && bun run build && PORT=50426 NODE_ENV=production bun run server.ts` | Command to start the app under test |
| `PLAYWRIGHT_SKIP_WEBSERVER` | unset | Skip auto-starting a web server |

## Test query params

The prototype supports optional query params used by the suite:

- `?demo=1` — start in demo mode without AI download
- `?nowebgpu=1` — force the no-WebGPU fallback screen for CI

## Selector strategy

Tests prefer Playwright role/text selectors (`getByRole`, `getByText`) and use `data-testid` only for non-semantic state such as the balance marker, narration container, and choice list.
