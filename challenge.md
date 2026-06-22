*This is a submission for the [June Solstice Game Jam](https://dev.to/challenges/june-game-jam-2026-06-03)*

## What I Built

**SOLSTICE VIGIL** is a solo narrative RPG. The sun stopped setting at the June solstice, and you are the wanderer trying to keep day and night from tipping over completely.

Each choice moves a balance meter between the Long Day and the Hush of Night. Push too far and the vigil ends. There is no boss fight, just a count of how many days you held the wheel, what you became along the way, and which strange things you stumbled into.

I wanted it to feel like an old manuscript you could actually play: mythic, a little lonely, not very chatty.

What you can do in the game:

- Balance day and night. The meter drives phase, mood, and how close you are to tipping over.
- Get scenes narrated on your own device. Gemma 4 (E2B) runs in Chrome through Google AI Edge LiteRT-LM and WebGPU. No server, no API key, nothing leaving the machine.
- Earn identities instead of picking a class. Titles like *Ember Saint* or *Moon Herald* show up after your choices pile up.
- Find rare encounters. Fifteen of them, with a codex, eligibility rules, and cards worth sharing.
- Roll a d20 on bold choices. Sometimes the solstice pushes back.
- Turn on speech narration if you want the scene read aloud. Music ducks while it plays.
- Try demo mode if you do not want to download the ~2 GB model. The full loop works with hand-written scenes.

Play it here: [https://solstice-vigil.vercel.app/](https://solstice-vigil.vercel.app/)

## Video Demo

Desktop (full walkthrough):

https://raw.githubusercontent.com/juanallo/solstice-vigil/main/demo-final/solstice-vigil-demo-final.mp4

Mobile (built on [Zo Computer](https://zo.computer) from my phone):

https://raw.githubusercontent.com/juanallo/solstice-vigil/main/demo-final/solstice-vigil-demo-final-mobile.mp4

```text
# copy-paste raw URLs
https://raw.githubusercontent.com/juanallo/solstice-vigil/main/demo-final/solstice-vigil-demo-final.mp4
https://raw.githubusercontent.com/juanallo/solstice-vigil/main/demo-final/solstice-vigil-demo-final-mobile.mp4
```

The demos cover the premise, on-device Gemma loading, an identity reveal, a rare encounter, a d20 roll, and demo mode.

<!-- DEV cover video: use solstice-vigil-demo-final.mp4 -->
<!-- DEV embed (if supported):
<video controls src="https://raw.githubusercontent.com/juanallo/solstice-vigil/main/demo-final/solstice-vigil-demo-final.mp4"></video>
-->

## Code

https://github.com/juanallo/solstice-vigil

![SOLSTICE VIGIL architecture — JS owns game state; Gemma 4 narrates on-device](https://raw.githubusercontent.com/juanallo/solstice-vigil/main/docs/solstice-vigil-architecture.png)

The diagram is the important part. JavaScript owns the game: balance, endings, identities, encounters, dice. Gemma gets structured context and returns JSON. It does not hold save state and it does not decide outcomes.

Repo: [github.com/juanallo/solstice-vigil](https://github.com/juanallo/solstice-vigil)

Places to start reading:

- `src/components/game/SolsticeVigil.tsx` — game loop, on-device LLM, UI states
- `src/lib/prompt.ts` — narrator prompt and turn context
- `src/lib/identity.ts` / `src/data/identities.ts` — inferred wanderer titles
- `src/lib/encounters.ts` / `src/data/encounters.ts` — rare wonders
- `src/lib/dice.ts` — d20 resolution
- `tests/` — Playwright unit + E2E (demo mode for CI)

## How I Built It

### The tech

I built this because I wanted to try Gemma 4, and Chrome's on-device LLM path made that possible without standing up a backend.

The game loads `@litert-lm/core` from a CDN, pulls the Gemma 4 E2B `.litertlm` file from Hugging Face, caches it with the Cache API, and streams scene JSON over WebGPU. Save state lives in `localStorage`. The model narrates; JavaScript decides.

Astro + React was the shell. Static delivery, React island for the game, room to grow if the vigil ever becomes more than one page.

View Transitions handle screen and scene changes. Phase flips and identity reveals feel less like hard cuts that way.

I also went looking for newer CSS worth using. `border-shape` gives the notched manuscript frames; clip-path covers browsers that do not have it yet.

On top of that: Web Speech for optional narration, Gemini for the two soundtrack pieces (*The Wheel of Sediment*, *Vigil of the Still Valley*), and Playwright + TDD because agent-written code looks fine until you actually click through it.

### Using AI

Most of this was built from my phone. I am a full-time dad, so "can I keep working while away from the desk" was not a bonus constraint. It was the whole point.

I started with a version of my [grill-me](https://juanmanuelalloron.com/post/my-current-ai-workflow-for-building-apps/) skill in ChatGPT. What is the loop? Why would anyone share a run? Why solstice, specifically? That argument became the PRD.

Then I moved to Zo Computer and got the first playable prototype working away from my desk: balance meter, phase flip, on-device Gemma, local save. [Watch the demo video under `demo/`.](https://raw.githubusercontent.com/juanallo/solstice-vigil/main/demo/solstice-vigil-demo.mp4) The production app came after that proof.

For visuals I used Google Stitch and ChatGPT to try directions fast. Dense or spacious? Dashboard or manuscript? Gold day or blue night? The spec in `docs/design.md` is what survived that round.

Desktop Cursor was the one part I could not do on my phone. Once the direction was clear, I ran several implementation plans in parallel. The commits tell that story:

| Commit | What shipped |
| --- | --- |
| `docs: define Solstice Vigil product direction` | PRD and creative north star |
| `chore: initialize project tooling` | Repo scaffolding, Playwright, TypeScript |
| `feat: add playable Solstice Vigil prototype` | First working game on Zo |
| `test: cover Solstice Vigil gameplay flows` | Initial E2E coverage |
| `docs: add demo capture artifacts` | Automated demo scripts + MP4 captures |
| `chore: add soundtrack assets` | Title and gameplay music tracks |
| `feat: integrate Astro framework and React` | Production app shell |
| `fix: adjust game mechanics and update tests` | One choice per phase; faster scored days |
| `feat: add new logo and favicon assets` | Branding |
| `refactor: enhance UI components and styles` | Manuscript UI pass |
| `feat: add discovered wanderer identity archetypes with reveal UI` | 12 inferred identities + share cards |
| `feat: add background music with persistent mute toggle` | Audio layer with localStorage preference |
| `feat: add new background image` | Key art background |
| `feat: pass richer story history to the on-device narrator` | Story memory codex for long-run coherence |
| `feat: add rare encounter system with discovery cards and share flow` | 15 wonders + codex |
| `feat: add view transitions and fix identity HUD badge icons` | View Transitions API + HUD polish |
| `feat: add Web Speech narration with optional auto-read` | Browser TTS with ducking |
| `fix: stop narration when a scene choice is selected` | Interrupt speech on choice |
| `feat: add d20 rolls for bold scene choices with celestial face assets` | Dice resolution + generated faces |
| `Add onboarding pacing and fix narration during encounter discovery` | Guided first encounter + first identity reveal |
| `feat: integrate new decoration styles and clean up solstice-vigil CSS` | `border-shape` framed UI system |

Same shape as the workflow I wrote up in [My Current AI Workflow for Building Apps](https://juanmanuelalloron.com/post/my-current-ai-workflow-for-building-apps/): argue the idea first, prototype early, design before you let agents run loose, ship in small slices, test the behavior for real.

## Prize Category

### Best Google AI Usage

Submitting here.

Gemma 4 (E2B) through Google AI Edge LiteRT-LM is the game loop, not decoration. Every live scene is generated on-device in Chrome. The model gets game state, story memory, identity context, and encounter history, then returns JSON the engine can parse.

Gemini wrote the soundtrack. Google Stitch helped me pick a UI direction before I started coding.

The part I care about most: the LLM is a narrator, not a game master. Balance, endings, identity tiers, encounter eligibility, and dice outcomes are plain JavaScript. That split is why on-device generation feels playable past the first few scenes instead of falling apart.

---

Thanks for playing. The wheel turns.
