import {
  type EncounterId,
  ENCOUNTERS,
  ENCOUNTER_IDS,
  encounterTitle,
  type EncounterAction,
} from "../data/encounters";
import { IDENTITIES, type IdentityId } from "../data/identities";
import { buildIdentityPromptBlock, type IdentityGameState } from "./identity";
import { buildStoryMemoryPromptBlock, type StoryGameState } from "./story-memory";
import {
  balanceDescriptor,
  CONTINUITY_INSTRUCTION,
  HISTORY_TURNS,
  type Phase,
  type PromptGameState,
  type TurnRecord,
} from "./prompt";

export const MIN_CYCLES_FOR_RARE = 15;
export const MIN_CYCLES_BETWEEN_RARE = 20;
export const BASE_RARE_CHANCE = 0.04;

export interface EncounterCodexEntry {
  firstSeenCycle: number;
  timesSeen: number;
}

export interface EncounterMemory {
  key: string;
  cycle: number;
  encounterId: EncounterId;
  label: string;
}

export interface PendingDiscovery {
  id: EncounterId;
  isFirst: boolean;
  cycle: number;
}

export interface EncounterState {
  codex: Partial<Record<EncounterId, EncounterCodexEntry>>;
  memories: EncounterMemory[];
  lastRareCycle: number;
  pendingDiscovery: PendingDiscovery | null;
  activeEncounterId: EncounterId | null;
  nextEncounterId?: EncounterId;
}

export interface EncounterGameState extends IdentityGameState, StoryGameState {
  cycle: number;
  phase: Phase;
  balance: number;
  rawTurns: TurnRecord[];
  encounter: EncounterState;
}

function formatRecentTurn(t: TurnRecord): string {
  const narr = t.narration.length > 240 ? `${t.narration.slice(0, 237)}...` : t.narration;
  return `[${t.archetype}/${t.phase}] ${narr} → chose: "${t.chosenLabel}" (${t.tone})`;
}

export function freshEncounterState(): EncounterState {
  return {
    codex: {},
    memories: [],
    lastRareCycle: -MIN_CYCLES_BETWEEN_RARE,
    pendingDiscovery: null,
    activeEncounterId: null,
  };
}

export function migrateEncounterFields(
  raw: Partial<EncounterGameState>,
): Pick<EncounterGameState, "encounter"> {
  const enc = raw.encounter;
  if (!enc) return { encounter: freshEncounterState() };
  return {
    encounter: {
      codex: enc.codex ?? {},
      memories: Array.isArray(enc.memories) ? enc.memories : [],
      lastRareCycle: enc.lastRareCycle ?? -MIN_CYCLES_BETWEEN_RARE,
      pendingDiscovery: enc.pendingDiscovery ?? null,
      activeEncounterId: enc.activeEncounterId ?? null,
      nextEncounterId: enc.nextEncounterId,
    },
  };
}

export function wonderCount(state: EncounterGameState): number {
  return Object.keys(state.encounter.codex).length;
}

function meetsRequirements(state: EncounterGameState, id: EncounterId): boolean {
  const def = ENCOUNTERS[id];
  const req = def.requirements;
  const enc = state.encounter;

  if (state.cycle < (req.minCycle ?? MIN_CYCLES_FOR_RARE)) return false;

  if (req.phase && req.phase !== "either" && state.phase !== req.phase) return false;

  if (req.minBalance !== undefined && state.balance < req.minBalance) return false;
  if (req.maxBalance !== undefined && state.balance > req.maxBalance) return false;
  if (req.maxAbsBalance !== undefined && Math.abs(state.balance) > req.maxAbsBalance) return false;

  if (req.identityAlignment) {
    const current = state.identity.current;
    if (!current) return false;
    if (IDENTITIES[current].alignment !== req.identityAlignment) return false;
  }

  if (req.identityIds?.length) {
    const current = state.identity.current;
    if (!current || !req.identityIds.includes(current)) return false;
  }

  if (req.requiresMemories && enc.memories.length === 0) return false;

  if (req.requiresCodex && !enc.codex[req.requiresCodex]) return false;

  if (req.scheduledCycleMod) {
    if (state.cycle <= 0 || state.cycle % req.scheduledCycleMod !== 0) return false;
  }

  return true;
}

function encounterWeight(state: EncounterGameState, id: EncounterId): number {
  const def = ENCOUNTERS[id];
  const seen = state.encounter.codex[id];
  if (def.requirements.scheduledCycleMod) return seen ? 0 : def.firstWeight;
  return seen ? def.repeatWeight : def.firstWeight;
}

export function eligibleEncounters(state: EncounterGameState): EncounterId[] {
  if (state.cycle < MIN_CYCLES_FOR_RARE) return [];
  if (state.cycle - state.encounter.lastRareCycle < MIN_CYCLES_BETWEEN_RARE) {
    const scheduled = ENCOUNTER_IDS.filter(
      (id) => ENCOUNTERS[id].requirements.scheduledCycleMod && meetsRequirements(state, id),
    );
    return scheduled;
  }

  return ENCOUNTER_IDS.filter((id) => meetsRequirements(state, id) && encounterWeight(state, id) > 0);
}

function pickWeighted(ids: EncounterId[], state: EncounterGameState, rng: () => number): EncounterId | null {
  if (ids.length === 0) return null;
  const weights = ids.map((id) => encounterWeight(state, id));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng() * total;
  for (let i = 0; i < ids.length; i++) {
    r -= weights[i];
    if (r <= 0) return ids[i];
  }
  return ids[ids.length - 1];
}

export interface RareSelection {
  id: EncounterId;
  isFirst: boolean;
}

export function selectRareEncounter(
  state: EncounterGameState,
  rng: () => number = Math.random,
): RareSelection | null {
  const forced = state.encounter.nextEncounterId;
  if (forced) {
    return { id: forced, isFirst: !state.encounter.codex[forced] };
  }

  const scheduled = ENCOUNTER_IDS.filter(
    (id) => ENCOUNTERS[id].requirements.scheduledCycleMod && meetsRequirements(state, id) && !state.encounter.codex[id],
  );
  if (scheduled.length > 0) {
    const id = pickWeighted(scheduled, state, rng);
    if (id) return { id, isFirst: true };
  }

  const eligible = eligibleEncounters(state).filter(
    (id) => !ENCOUNTERS[id].requirements.scheduledCycleMod || state.encounter.codex[id],
  );
  if (eligible.length === 0) return null;

  if (rng() > BASE_RARE_CHANCE) return null;

  const id = pickWeighted(eligible, state, rng);
  if (!id) return null;
  return { id, isFirst: !state.encounter.codex[id] };
}

export function prepareRareTurn<T extends EncounterGameState>(
  state: T,
  selection: RareSelection,
): T {
  return {
    ...state,
    encounter: {
      ...state.encounter,
      activeEncounterId: selection.id,
      pendingDiscovery: {
        id: selection.id,
        isFirst: selection.isFirst,
        cycle: state.cycle,
      },
      nextEncounterId: undefined,
    },
  };
}

export function clearForcedEncounter<T extends EncounterGameState>(state: T): T {
  if (!state.encounter.nextEncounterId) return state;
  return {
    ...state,
    encounter: { ...state.encounter, nextEncounterId: undefined },
  };
}

export function memoriesForEncounter(state: EncounterGameState, id: EncounterId): EncounterMemory[] {
  return state.encounter.memories.filter((m) => m.encounterId === id);
}

export function buildRareEncounterPrompt(state: PromptGameState, id: EncounterId): string {
  const def = ENCOUNTERS[id];
  const recent = state.rawTurns.slice(-HISTORY_TURNS).map(formatRecentTurn).join("\n");
  const memoryBlock = buildStoryMemoryPromptBlock(state.storyMemory);
  const identityBlock = buildIdentityPromptBlock(state);
  const encounterMemories = memoriesForEncounter(state, id);
  const priorVisits = state.encounter.codex[id];

  const lines = [
    `STATE — Day ${state.cycle + 1}. Phase: ${state.phase === "day" ? "DAY (the Long Day)" : "NIGHT (the Hush of Night)"}.`,
    `The world ${balanceDescriptor(state.balance)} (balance ${state.balance}).`,
    `Days survived so far: ${state.cycle}.`,
    recent ? `RECENT TURNS —\n${recent}` : "RECENT TURNS — (the vigil has just begun)",
    memoryBlock ?? "",
    identityBlock ?? "",
    "",
    "RARE ENCOUNTER (internal — render this specific wonder; never name rarity or mechanics):",
    `Kind: ${def.kind}. Title: ${def.title}.`,
    `Essence: ${def.tagline}`,
  ];

  if (priorVisits) {
    lines.push(`The wanderer has met this wonder before (first at cycle ${priorVisits.firstSeenCycle}, ${priorVisits.timesSeen} time(s)). Reference shared history naturally.`);
  }

  if (encounterMemories.length > 0) {
    const memLines = encounterMemories.map((m) => {
      const ago = state.cycle - m.cycle;
      return `- ${ago} cycle(s) ago: ${m.label}`;
    });
    lines.push("Prior choices at this wonder:", ...memLines);
    lines.push('Weave callbacks ("eighty-three vigils ago you refused his bargain").');
  }

  lines.push(
    CONTINUITY_INSTRUCTION,
    `TASK — Render the rare ${def.kind} "${def.title}" for the current ${state.phase.toUpperCase()} phase.`,
    "Write 2-4 sentences of mythic narration, then exactly 3 action choices.",
    "Output the JSON object now.",
  );

  return lines.filter(Boolean).join("\n");
}

export function getRareFallbackScene(
  id: EncounterId,
  phase: Phase,
  state: EncounterGameState,
) {
  const def = ENCOUNTERS[id];
  const isRepeat = !!state.encounter.codex[id];
  const memoryLabels = memoriesForEncounter(state, id).map((m) => m.label);
  return def.fallback(phase, isRepeat, memoryLabels);
}

export function recordEncounterOutcome<T extends EncounterGameState>(
  state: T,
  encounterId: EncounterId,
  action: EncounterAction,
): T {
  const existing = state.encounter.codex[encounterId];
  const codex = {
    ...state.encounter.codex,
    [encounterId]: existing
      ? { ...existing, timesSeen: existing.timesSeen + 1 }
      : { firstSeenCycle: state.cycle, timesSeen: 1 },
  };

  let memories = state.encounter.memories;
  if (action.memory) {
    const mem: EncounterMemory = {
      key: action.memory.key,
      cycle: state.cycle,
      encounterId,
      label: action.memory.label,
    };
    memories = [...memories.filter((m) => m.key !== mem.key), mem].slice(-20);
  }

  return {
    ...state,
    encounter: {
      ...state.encounter,
      codex,
      memories,
      lastRareCycle: state.cycle,
      activeEncounterId: null,
    },
  };
}

export function dismissDiscovery<T extends EncounterGameState>(state: T): T {
  return {
    ...state,
    encounter: { ...state.encounter, pendingDiscovery: null },
  };
}

export { encounterTitle };
