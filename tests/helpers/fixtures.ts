import type { Page } from "@playwright/test";
import type { TurnRecord } from "../../src/lib/prompt";
import type { StoryMemory } from "../../src/lib/story-memory";
import { DEMO_QUERY, SAVE_KEY } from "./constants";

export interface GameStateFixture {
  cycle: number;
  turn: number;
  phase: "day" | "night";
  balance: number;
  lastTone: "yang" | "yin" | "neutral" | null;
  stagnationStreak: number;
  lastArchetype: string | null;
  rawTurns: TurnRecord[];
  storyMemory: StoryMemory;
  identity?: {
    current: string | null;
    history: { cycle: number; id: string; title: string }[];
  };
  pendingReveal?: { id: string; cycle: number; kind: "become" | "known" } | null;
  lastRevealCycle?: number;
}

function makeYangTurns(n: number): TurnRecord[] {
  return Array.from({ length: n }, () => ({
    archetype: "Temptation",
    phase: "day" as const,
    narration: "A brazier burns without fuel.",
    chosenLabel: "Feed the brazier, embrace the blaze",
    balanceShift: -28,
    tone: "yang" as const,
  }));
}

export const sampleRawTurns: TurnRecord[] = [
  {
    archetype: "Threshold",
    phase: "day",
    narration:
      'A bridge of frozen light spans a chasm where the sun has stopped sinking. A gatekeeper stands at its center, wreathed in halted flame, neither welcoming nor forbidding. "Cross, or turn back," it says, and means both.',
    chosenLabel: "Stride boldly into the unsetting light",
    balanceShift: -38,
    tone: "yang",
  },
  {
    archetype: "Wanderer",
    phase: "night",
    narration:
      'A pale wanderer beckons from a doorway lit by a single steady candle. "Come in," she says. "Warmth costs a little of your night."',
    chosenLabel: "Bargain at the threshold",
    balanceShift: 8,
    tone: "neutral",
  },
];

export const sampleStoryMemory: StoryMemory = {
  entities: [
    {
      id: "gatekeeper",
      kind: "npc",
      name: "gatekeeper",
      firstCycle: 0,
      lastCycle: 0,
      tags: [],
    },
    {
      id: "frozen-light",
      kind: "place",
      name: "frozen light",
      firstCycle: 0,
      lastCycle: 0,
      tags: [],
    },
  ],
  beats: [
    {
      cycle: 0,
      turn: 1,
      summary:
        '(day) A bridge of frozen light spans a chasm where the sun has stopped sinking. A gatekeeper stands at its center... → "Stride boldly into the unsetting light"',
      entityIds: ["gatekeeper", "frozen-light"],
    },
  ],
};

export const freshSave: GameStateFixture = {
  cycle: 0,
  turn: 0,
  phase: "day",
  balance: 0,
  lastTone: null,
  stagnationStreak: 0,
  lastArchetype: null,
  rawTurns: [],
  storyMemory: { entities: [], beats: [] },
  identity: { current: null, history: [] },
  pendingReveal: null,
  lastRevealCycle: -5,
};

export const longDayWarningSave: GameStateFixture = {
  cycle: 0,
  turn: 2,
  phase: "day",
  balance: -75,
  lastTone: "yang",
  stagnationStreak: 2,
  lastArchetype: "Threshold",
  rawTurns: [sampleRawTurns[0]],
  storyMemory: { entities: [], beats: [] },
};

export const hushWarningSave: GameStateFixture = {
  cycle: 0,
  turn: 2,
  phase: "night",
  balance: 75,
  lastTone: "yin",
  stagnationStreak: 2,
  lastArchetype: "Threshold",
  rawTurns: [
    {
      archetype: "Threshold",
      phase: "night",
      narration:
        "A threshold of black ice marks where the Hush begins. Two roads fork beneath a moon that has stopped climbing.",
      chosenLabel: "Descend into the deep Hush",
      balanceShift: 38,
      tone: "yin",
    },
  ],
  storyMemory: { entities: [], beats: [] },
};

export const nearGameOverDaySave: GameStateFixture = {
  cycle: 0,
  turn: 1,
  phase: "day",
  balance: -95,
  lastTone: "yang",
  stagnationStreak: 1,
  lastArchetype: "Threshold",
  rawTurns: [],
  storyMemory: { entities: [], beats: [] },
};

export const nearGameOverNightSave: GameStateFixture = {
  cycle: 0,
  turn: 1,
  phase: "night",
  balance: 95,
  lastTone: "yin",
  stagnationStreak: 1,
  lastArchetype: "Threshold",
  rawTurns: [],
  storyMemory: { entities: [], beats: [] },
};

export const midGameSave: GameStateFixture = {
  cycle: 1,
  turn: 3,
  phase: "night",
  balance: -15,
  lastTone: "yang",
  stagnationStreak: 1,
  lastArchetype: "Wanderer",
  rawTurns: sampleRawTurns,
  storyMemory: sampleStoryMemory,
  identity: { current: null, history: [] },
  pendingReveal: null,
  lastRevealCycle: -5,
};

export const identityHeavyLightSave: GameStateFixture = {
  cycle: 12,
  turn: 24,
  phase: "day",
  balance: -50,
  lastTone: "yang",
  stagnationStreak: 1,
  lastArchetype: "Temptation",
  rawTurns: makeYangTurns(24),
  storyMemory: { entities: [], beats: [] },
  identity: { current: null, history: [] },
  pendingReveal: null,
  lastRevealCycle: -5,
};

export const gameOverWithIdentitySave: GameStateFixture = {
  cycle: 14,
  turn: 28,
  phase: "day",
  balance: -95,
  lastTone: "yang",
  stagnationStreak: 1,
  lastArchetype: "Temptation",
  rawTurns: makeYangTurns(24),
  storyMemory: { entities: [], beats: [] },
  identity: {
    current: "flame-herald",
    history: [
      { cycle: 12, id: "flame-herald", title: "Flame Herald" },
      { cycle: 8, id: "ember-saint", title: "Ember Saint" },
    ],
  },
  pendingReveal: null,
  lastRevealCycle: 12,
};

export async function clearSave(page: Page) {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
}

export async function seedSave(page: Page, state: GameStateFixture) {
  await page.goto("/");
  await page.evaluate(
    ({ key, value }: { key: string; value: GameStateFixture }) => {
      localStorage.setItem(key, JSON.stringify(value));
    },
    { key: SAVE_KEY, value: state },
  );
}

export async function getSave(page: Page): Promise<GameStateFixture | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, SAVE_KEY);
}

export async function gotoTitle(page: Page, demo = false) {
  await page.goto(demo ? `/${DEMO_QUERY}` : "/");
}

export async function startDemo(page: Page) {
  await gotoTitle(page, true);
  await page.getByRole("button", { name: "Begin the vigil" }).click();
  await waitForScene(page);
}

export async function startDemoFromLink(page: Page) {
  await gotoTitle(page);
  await page.getByRole("button", { name: /Try demo mode/i }).click();
  await waitForScene(page);
}

export async function waitForScene(page: Page) {
  await page.getByTestId("narration").waitFor({ state: "visible" });
  await page.getByTestId("choices").locator("button").first().waitFor({ state: "visible" });
}

export async function getBalanceMarkerLeft(page: Page): Promise<string> {
  return page.getByTestId("balance-marker").evaluate((el) => el.style.left);
}

export async function clickChoiceByIndex(page: Page, index: number) {
  const choices = page.getByTestId("choices").locator("button");
  await choices.nth(index).click();
}

export async function clickFirstChoice(page: Page) {
  await clickChoiceByIndex(page, 0);
}

export async function clickStrongestYangChoice(page: Page) {
  const yangPattern =
    /Stride boldly|Feed the brazier|Stoke it further|Press on across|Will the sun to hold|Take the quick east|Enter, surrender|Welcome the foreseen dawn|Turn from the pool|Claw back toward the failing light|Let the lurch carry you into day|Open your eyes to the sudden gold/i;
  const match = page.getByRole("button", { name: yangPattern });
  if ((await match.count()) > 0) {
    await match.first().click();
    return;
  }
  await clickFirstChoice(page);
}

export async function clickStrongestYinChoice(page: Page) {
  const yinPattern =
    /Descend into the deep Hush|Sink into the still water|Let the Hush deepen|Stay out in the deep cold|Lean into the coming cool|Walk past the fire|Follow the slow west road|Let the lurch carry you into night|Spread your arms to the sudden cold|Pull the broken night around you/i;
  const match = page.getByRole("button", { name: yinPattern });
  if ((await match.count()) > 0) {
    await match.first().click();
    return;
  }
  await page.getByTestId("choices").locator("button").nth(1).click();
}

export async function clickNeutralChoice(page: Page) {
  const neutralPattern =
    /Stand a while at the threshold|Linger at the frozen fork|Share her water and rest|Bargain at the threshold|Mark the omen and move on|Watch the reflection a moment|Walk past the fire|Turn from the pool/i;
  const match = page.getByRole("button", { name: neutralPattern });
  if ((await match.count()) > 0) {
    await match.first().click();
    return;
  }
  await clickChoiceByIndex(page, 2);
}

export async function seedRandom(page: Page, seed = 0.42) {
  await page.addInitScript((value: number) => {
    let state = value;
    Math.random = () => {
      state = (state * 9301 + 49297) % 233280;
      return state / 233280;
    };
  }, seed);
}
