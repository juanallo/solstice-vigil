import { oracleLine, tierLine, type RollTier } from "./dice";
import { buildIdentityPromptBlock, type IdentityGameState } from "./identity";
import {
  buildStoryMemoryPromptBlock,
  type StoryGameState,
} from "./story-memory";

export type { RollTier };

export const HISTORY_TURNS = 6;
export const NARRATION_SUMMARY_MAX = 240;

export type Phase = "day" | "night";
export type Archetype = "Threshold" | "Wanderer" | "Omen" | "Temptation" | "Lurch";
export type Tone = "yang" | "yin" | "neutral";

export interface TurnRecord {
  archetype: Archetype;
  phase: Phase;
  narration: string;
  chosenLabel: string;
  balanceShift: number;
  tone: Tone;
  roll?: number;
  rollTier?: RollTier;
  baseBalanceShift?: number;
}

export interface PromptGameState extends IdentityGameState, StoryGameState {
  cycle: number;
  turn: number;
  phase: Phase;
  balance: number;
  rawTurns: TurnRecord[];
}

export const CONTINUITY_INSTRUCTION =
  "Continue the same journey. Reuse named characters and places from RECENT TURNS and STORY MEMORY when natural. Do not contradict prior events.";

export const SYSTEM_PROMPT_CONTINUITY =
  "When RECENT TURNS or STORY MEMORY mentions a character or place, prefer continuing that thread over inventing a new one.";

export function balanceDescriptor(b: number): string {
  if (b <= -60) return "deep in the Long Day, the sun glutted and still";
  if (b <= -20) return "leaning toward the Long Day";
  if (b < 20) return "near balance, the wheel almost turning";
  if (b < 60) return "leaning toward the Hush of Night";
  return "deep in the Hush, the night endless";
}

function diceTurnHint(t: TurnRecord): string {
  if (t.rollTier !== "fumble" && t.rollTier !== "critical") return "";
  const line = oracleLine(t.phase, t.tone, t.rollTier) ?? tierLine(t.rollTier);
  return ` [${line.toLowerCase()}]`;
}

function formatRecentTurn(t: TurnRecord): string {
  const narr =
    t.narration.length > NARRATION_SUMMARY_MAX
      ? `${t.narration.slice(0, NARRATION_SUMMARY_MAX - 3)}...`
      : t.narration;
  return `[${t.archetype}/${t.phase}] ${narr} → chose: "${t.chosenLabel}" (${t.tone})${diceTurnHint(t)}`;
}

export function buildDiceOracleBlock(lastTurn: TurnRecord | undefined): string | null {
  if (!lastTurn?.rollTier) return null;
  if (lastTurn.rollTier !== "fumble" && lastTurn.rollTier !== "critical") return null;
  const line = oracleLine(lastTurn.phase, lastTurn.tone, lastTurn.rollTier) ?? tierLine(lastTurn.rollTier);
  const mood =
    lastTurn.rollTier === "fumble"
      ? "The wanderer's last bold step went badly"
      : "The wanderer's last bold step went wondrously";
  return `LAST ORACLE (internal — weave subtly; never mention dice or numbers): ${mood}. Echo: "${line}"`;
}

export function buildTurnPrompt(s: PromptGameState, arch: Archetype): string {
  const recent = s.rawTurns.slice(-HISTORY_TURNS).map(formatRecentTurn).join("\n");
  const memoryBlock = buildStoryMemoryPromptBlock(s.storyMemory);
  const identityBlock = buildIdentityPromptBlock(s);
  const lastTurn = s.rawTurns[s.rawTurns.length - 1];
  const diceBlock = buildDiceOracleBlock(lastTurn);

  return [
    `STATE — Day ${s.cycle + 1}. Phase: ${s.phase === "day" ? "DAY (the Long Day)" : "NIGHT (the Hush of Night)"}.`,
    `The world ${balanceDescriptor(s.balance)} (balance ${s.balance}).`,
    `Days survived so far: ${s.cycle}.`,
    recent ? `RECENT TURNS —\n${recent}` : "RECENT TURNS — (the vigil has just begun)",
    diceBlock ?? "",
    memoryBlock ?? "",
    identityBlock ?? "",
    CONTINUITY_INSTRUCTION,
    `TASK — Render a ${arch} encounter for the current ${s.phase.toUpperCase()} phase.`,
    "Output the JSON object now.",
  ]
    .filter(Boolean)
    .join("\n");
}
