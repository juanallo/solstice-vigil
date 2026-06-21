# SOLSTICE VIGIL — Design Spec

## Direction

Theme the UI around the generated key art: a frozen solstice world split between burning gold daylight and deep blue-black night. The game should feel like a playable illuminated manuscript: ancient, solemn, readable, and ritualistic.

Keep the current functionality exactly the same:

- Landing screen
- Begin the vigil
- Continue the vigil
- Demo mode
- Game screen
- Cycle count
- Current state label
- Vigil count
- Day / Night balance meter
- Restart link
- Narrative passage
- Three choice buttons
- Local progress messaging

## Visual Mood

The current UI is too bright and flat for the premise. Move from soft yellow web page to dark mythic fantasy UI.

Use the key art as the emotional anchor:

- Half sun, half night
- Ancient wheel
- Lone wanderer
- Gold light against cold blue shadow
- Ruined stone, frost, stillness, ritual

The UI should feel like the player is standing inside the vigil, not reading a plain page about it.

## Color Palette

```css
:root {
  --sv-bg: #061019;
  --sv-bg-soft: #0b1824;
  --sv-panel: rgba(5, 12, 18, 0.86);
  --sv-panel-strong: rgba(3, 8, 13, 0.94);

  --sv-gold: #d8a84b;
  --sv-gold-bright: #f6cc68;
  --sv-gold-dim: #8b6228;

  --sv-night: #23356f;
  --sv-night-deep: #101831;
  --sv-moon: #b7c4d6;

  --sv-text: #ead8b4;
  --sv-text-muted: #a98f65;
  --sv-border: rgba(216, 168, 75, 0.5);

  --sv-danger-day: #ffb13b;
  --sv-danger-night: #566dca;
}
```

## Typography

Use a strong serif for the fantasy/RPG tone and a clean sans-serif for UI labels.

Recommended stack:

```css
--font-title: "Cinzel", "Cormorant Garamond", Georgia, serif;
--font-body: "Cormorant Garamond", Georgia, serif;
--font-ui: Inter, system-ui, sans-serif;
```

Usage:

- Title: uppercase serif, wide tracking
- Narrative: large readable serif
- Buttons: uppercase or title case UI/serif hybrid
- Metadata labels: small caps, wide letter spacing

## Layout

### Landing Screen

Use a full-screen background image with a dark overlay.

Structure:

```txt
[full viewport background art]
  [centered dark glass panel]
    sun/wheel sigil
    SOLSTICE VIGIL
    subtitle
    description
    technical note
    Begin the vigil
    Continue the vigil
    Demo link
```

Rules:

- Keep the content centered.
- Max width: `720px`.
- Add breathing room on mobile.
- The background should be visible but never hurt readability.
- Use a subtle gold border around the panel.

### Game Screen

Structure:

```txt
[top status row]
  Cycle 0          ☀ Long Day          0 Vigils

[balance labels]
  Day              Balance             Night

[balance meter]
  gold → pale center → night blue

[state hint + restart]

[narrative card]
  optional scene image / background texture
  story text

[choice stack]
  choice 1
  choice 2
  choice 3
```

On desktop, the game screen can use a centered column with max width `980px`. On mobile, it should remain single-column.

## Background Treatment

Use the generated image as either:

1. A global fixed page background, or
2. A landing-only hero background plus subtle texture for gameplay.

Recommended CSS:

```css
body {
  min-height: 100vh;
  color: var(--sv-text);
  background:
    linear-gradient(rgba(3, 8, 13, 0.78), rgba(3, 8, 13, 0.9)),
    url("/solstice-vigil-bg.png") center / cover fixed no-repeat;
}
```

For the game screen, add a stronger overlay:

```css
.game-shell {
  background: radial-gradient(circle at top left, rgba(216,168,75,0.14), transparent 34%),
              radial-gradient(circle at top right, rgba(35,53,111,0.18), transparent 34%),
              rgba(3, 8, 13, 0.82);
  border: 1px solid var(--sv-border);
  box-shadow: 0 30px 80px rgba(0,0,0,0.45);
}
```

## Components

### Panel

```css
.sv-panel {
  background: var(--sv-panel);
  border: 1px solid var(--sv-border);
  box-shadow: 0 24px 80px rgba(0,0,0,0.55);
  backdrop-filter: blur(10px);
}
```

### Title

```css
.sv-title {
  font-family: var(--font-title);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--sv-text);
  text-shadow: 0 0 24px rgba(216,168,75,0.28);
}
```

### Balance Meter

The balance meter is one of the most important pieces of UI. It should feel like the actual wheel of day and night.

```css
.balance-track {
  height: 18px;
  border-radius: 999px;
  border: 1px solid rgba(216,168,75,0.55);
  background: linear-gradient(90deg,
    #d98324 0%,
    #f6cc68 28%,
    #ead8b4 50%,
    #5162bb 72%,
    #101831 100%);
  box-shadow: inset 0 0 12px rgba(0,0,0,0.5);
}

.balance-marker {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--sv-gold-bright), var(--sv-gold-dim));
  border: 2px solid #2b1b0b;
  box-shadow: 0 0 18px rgba(246,204,104,0.55);
}
```

### Buttons

Primary action should feel gold/day-aligned. Secondary should feel night-aligned.

```css
.button-primary {
  color: #fff7de;
  background: linear-gradient(135deg, #8b3f10, #d8a84b 48%, #23356f);
  border: 1px solid var(--sv-gold);
}

.button-secondary,
.choice-button {
  color: var(--sv-text);
  background: rgba(6, 16, 25, 0.78);
  border: 1px solid var(--sv-border);
}

.choice-button:hover {
  transform: translateY(-1px);
  border-color: var(--sv-gold-bright);
  box-shadow: 0 0 24px rgba(216,168,75,0.18);
}
```

Choice buttons can include small icons:

- Sun for light/day choices
- Moon or feather for Hush/night choices
- Hourglass or wheel for threshold/wait choices

## Copy Styling

Narrative text should be prominent and readable.

```css
.narrative {
  font-family: var(--font-body);
  font-size: clamp(1.45rem, 2vw, 2.1rem);
  line-height: 1.55;
  color: var(--sv-text);
}
```

Status/helper text:

```css
.meta {
  font-family: var(--font-ui);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 0.8rem;
  color: var(--sv-text-muted);
}
```

## Interaction Notes

- Hover states should glow, not bounce.
- Avoid playful animation.
- Use slow fades and subtle light movement.
- The balance marker can animate slightly when choices are selected.
- A transformation state should shift the whole theme subtly toward day or night.

## Responsive Rules

Mobile:

- Reduce title tracking slightly.
- Keep buttons full width.
- Narrative stays large but not oversized.
- Avoid two-column layouts.
- Background image should remain decorative, not content-critical.

```css
@media (max-width: 720px) {
  .sv-panel,
  .game-shell {
    margin: 16px;
    padding: 24px;
  }

  .sv-title {
    font-size: clamp(2.5rem, 12vw, 4rem);
    letter-spacing: 0.06em;
  }

  .narrative {
    font-size: 1.35rem;
  }
}
```

## Implementation Plan

1. Add the generated background image to the app assets.
2. Replace the yellow page background with the dark image-backed theme.
3. Add CSS variables for the Solstice Vigil palette.
4. Wrap landing content in a glass/dark ritual panel.
5. Restyle Begin, Continue, and Demo actions.
6. Restyle game HUD with gold/night typography.
7. Replace the plain balance bar with the solstice gradient meter.
8. Restyle choice buttons as ritual cards.
9. Add responsive polish.
10. Keep game logic untouched.

## Non-Goals

- Do not add new mechanics.
- Do not change save behavior.
- Do not change the narrative generation flow.
- Do not require server-side rendering.
- Do not make the UI unreadable for the sake of atmosphere.

## Strong Recommendation

Keep the game mostly text-first. The background art should create atmosphere, but the readable story and choices are the product. The best version is not a busy fantasy website; it is a dark ritual interface where every click feels like moving the wheel.
