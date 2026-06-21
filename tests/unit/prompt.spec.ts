import { test, expect } from "@playwright/test";
import { buildTurnPrompt, CONTINUITY_INSTRUCTION } from "../../src/lib/prompt";
import {
  buildStoryMemoryPromptBlock,
  extractProperNouns,
  freshStoryMemory,
  updateStoryMemory,
} from "../../src/lib/story-memory";
import {
  freshSave,
  midGameSave,
  sampleRawTurns,
  sampleStoryMemory,
} from "../helpers/fixtures";

test.describe("buildTurnPrompt", () => {
  test("fresh vigil has no recent turns but includes continuity instruction", () => {
    const prompt = buildTurnPrompt(
      {
        ...freshSave,
        storyMemory: freshStoryMemory(),
        identity: { current: null, history: [] },
        pendingReveal: null,
        lastRevealCycle: -5,
      },
      "Threshold",
    );

    expect(prompt).toContain("RECENT TURNS — (the vigil has just begun)");
    expect(prompt).toContain(CONTINUITY_INSTRUCTION);
    expect(prompt).toContain("TASK — Render a Threshold encounter");
    expect(prompt).not.toContain("STORY MEMORY (internal");
  });

  test("includes enriched recent turns with archetype and tone", () => {
    const prompt = buildTurnPrompt(
      {
        ...midGameSave,
        identity: { current: null, history: [] },
        pendingReveal: null,
        lastRevealCycle: -5,
      },
      "Wanderer",
    );

    expect(prompt).toContain("[Threshold/day]");
    expect(prompt).toContain("gatekeeper");
    expect(prompt).toContain('→ chose: "Stride boldly into the unsetting light" (yang)');
    expect(prompt).toContain("[Wanderer/night]");
    expect(prompt).toContain('→ chose: "Bargain at the threshold" (neutral)');
    expect(prompt).not.toContain("-> chose:");
  });

  test("includes story memory block when codex has entries", () => {
    const memoryBlock = buildStoryMemoryPromptBlock(sampleStoryMemory);
    expect(memoryBlock).toContain("STORY MEMORY");
    expect(memoryBlock).toContain("gatekeeper");

    const prompt = buildTurnPrompt(
      {
        ...midGameSave,
        identity: { current: null, history: [] },
        pendingReveal: null,
        lastRevealCycle: -5,
      },
      "Omen",
    );

    expect(prompt).toContain("STORY MEMORY");
    expect(prompt).toContain("Known figures and places:");
    expect(prompt).toContain("Past beats:");
  });
});

test.describe("story memory extraction", () => {
  test("extracts proper nouns from narration and choice", () => {
    const names = extractProperNouns(sampleRawTurns[0].narration, sampleRawTurns[0].chosenLabel);
    expect(names.some((n) => /gatekeeper/i.test(n))).toBe(true);
  });

  test("updateStoryMemory records entities and beats", () => {
    const memory = updateStoryMemory(freshStoryMemory(), {
      cycle: 0,
      turn: 1,
      phase: "day",
      narration: sampleRawTurns[0].narration,
      chosenLabel: sampleRawTurns[0].chosenLabel,
    });

    expect(memory.entities.length).toBeGreaterThan(0);
    expect(memory.beats).toHaveLength(1);
    expect(memory.beats[0].summary).toContain("Stride boldly into the unsetting light");
  });
});
