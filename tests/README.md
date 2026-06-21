# Playwright E2E Tests

These tests validate Solstice Vigil behavior on the root Astro site.

## Run locally

```bash
npm run test:e2e
```

This starts the Astro dev server at `http://127.0.0.1:4321` and runs the demo-mode suite.

## Target another server

Point the same suite at a different build by setting environment variables:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 \
PLAYWRIGHT_WEB_SERVER_COMMAND="npm run preview -- --host 127.0.0.1 --port 4321" \
npm run test:e2e
```

To run against a server you already started:

```bash
PLAYWRIGHT_SKIP_WEBSERVER=1 \
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4321 \
npm run test:e2e
```

## Validate the prototype reference app

The frozen prototype under `prototype/` can still be checked separately:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:50426 \
PLAYWRIGHT_WEB_SERVER_COMMAND="cd prototype && bun run dev" \
npm run test:e2e
```

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PLAYWRIGHT_BASE_URL` | `http://127.0.0.1:4321` | Base URL for navigation |
| `PLAYWRIGHT_WEB_SERVER_COMMAND` | `npm run dev -- --host 127.0.0.1 --port 4321` | Command to start the app under test |
| `PLAYWRIGHT_SKIP_WEBSERVER` | unset | Skip auto-starting a web server |

## Test query params

The game supports optional query params used by the suite:

- `?demo=1` — start in demo mode without AI download
- `?nowebgpu=1` — force the no-WebGPU fallback screen for CI

## Selector strategy

Tests prefer Playwright role/text selectors (`getByRole`, `getByText`) and use `data-testid` only for non-semantic state such as the balance marker, narration container, and choice list.
