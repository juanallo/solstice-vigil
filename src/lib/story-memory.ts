type Phase = "day" | "night";

export interface StoryEntity {
  id: string;
  kind: "npc" | "place";
  name: string;
  firstCycle: number;
  lastCycle: number;
  tags: string[];
}

export interface StoryBeat {
  cycle: number;
  turn: number;
  summary: string;
  entityIds: string[];
}

export interface StoryMemory {
  entities: StoryEntity[];
  beats: StoryBeat[];
}

export interface StoryGameState {
  storyMemory: StoryMemory;
}

export interface TurnMemoryInput {
  cycle: number;
  turn: number;
  phase: Phase;
  narration: string;
  chosenLabel: string;
}

export const MAX_BEATS = 30;
export const MAX_ENTITIES = 40;
export const MEMORY_BEATS_IN_PROMPT = 8;

const SKIP_NAMES = new Set([
  "You", "The", "Long", "Day", "Night", "Hush", "Solstice", "When", "Come", "Cross", "Or",
  "Beyond", "Though", "Cycle", "Quick", "June", "Once", "Still", "Something", "Someone",
  "Nothing", "Everything", "Every", "Each", "Both", "Neither", "Never", "Always",
]);

const PLACE_PATTERN =
  /\b(Bridge|Tower|Garden|Observatory|Library|Sea|Road|Fork|Threshold|Pool|Fountain|Chasm|Valley|Shrine|Doorway|Gate|Ice|Brazier|Sundial|Tree|Windows|Sky|Moon|Sun|Fountain|Observatory)\b/i;

export function freshStoryMemory(): StoryMemory {
  return { entities: [], beats: [] };
}

export function migrateStoryMemory(raw: Partial<StoryGameState>): StoryMemory {
  const memory = raw.storyMemory;
  if (!memory || !Array.isArray(memory.entities) || !Array.isArray(memory.beats)) {
    return freshStoryMemory();
  }
  return {
    entities: memory.entities.slice(-MAX_ENTITIES),
    beats: memory.beats.slice(-MAX_BEATS),
  };
}

export function entityId(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function classifyEntity(name: string): "npc" | "place" {
  return PLACE_PATTERN.test(name) ? "place" : "npc";
}

function normalizeName(name: string): string {
  const trimmed = name.trim();
  if (/^the\s+/i.test(trimmed)) return trimmed.replace(/^the\s+/i, "The ");
  return trimmed;
}

export function extractProperNouns(narration: string, chosenLabel: string): string[] {
  const text = `${narration} ${chosenLabel}`;
  const found = new Set<string>();

  for (const match of text.matchAll(/\bThe ([A-Z][a-z]+(?: [A-Z][a-z]+){0,3})\b/g)) {
    const name = `The ${match[1]}`;
    if (!SKIP_NAMES.has(match[1].split(" ")[0])) found.add(name);
  }

  for (const match of text.matchAll(/\b[Aa]n? ([a-z][a-z]+(?: [a-z]+){0,2})\b/g)) {
    const role = match[1];
    if (SKIP_NAMES.has(role.split(" ")[0])) continue;
    const name = role.charAt(0).toUpperCase() + role.slice(1);
    found.add(name);
  }

  for (const match of text.matchAll(/\b([A-Z][a-z]+(?: [A-Z][a-z]+){0,2})\b/g)) {
    const name = match[1];
    const first = name.split(" ")[0];
    if (SKIP_NAMES.has(first) || SKIP_NAMES.has(name)) continue;
    if (name.length < 3) continue;
    if (/^(Day|Night|Long|Hush)$/.test(name)) continue;
    found.add(name);
  }

  return [...found].map(normalizeName);
}

function makeBeatSummary(input: TurnMemoryInput): string {
  const narr =
    input.narration.length > 120
      ? `${input.narration.slice(0, 117)}...`
      : input.narration;
  return `(${input.phase}) ${narr} → "${input.chosenLabel}"`;
}

function upsertEntity(
  entities: StoryEntity[],
  name: string,
  cycle: number,
): { entities: StoryEntity[]; id: string } {
  const normalized = normalizeName(name);
  const id = entityId(normalized);
  const idx = entities.findIndex((e) => e.id === id);
  if (idx === -1) {
    const entity: StoryEntity = {
      id,
      kind: classifyEntity(normalized),
      name: normalized,
      firstCycle: cycle,
      lastCycle: cycle,
      tags: [],
    };
    return { entities: [...entities, entity].slice(-MAX_ENTITIES), id };
  }
  const next = [...entities];
  next[idx] = { ...next[idx], lastCycle: cycle };
  return { entities: next, id };
}

export function updateStoryMemory(memory: StoryMemory, input: TurnMemoryInput): StoryMemory {
  const names = extractProperNouns(input.narration, input.chosenLabel);
  let entities = memory.entities;
  const entityIds: string[] = [];

  for (const name of names) {
    const result = upsertEntity(entities, name, input.cycle);
    entities = result.entities;
    entityIds.push(result.id);
  }

  const beat: StoryBeat = {
    cycle: input.cycle,
    turn: input.turn,
    summary: makeBeatSummary(input),
    entityIds: [...new Set(entityIds)],
  };

  return {
    entities,
    beats: [...memory.beats, beat].slice(-MAX_BEATS),
  };
}

export function buildStoryMemoryPromptBlock(memory: StoryMemory): string | null {
  if (memory.entities.length === 0 && memory.beats.length === 0) return null;

  const lines = ["STORY MEMORY (internal — weave subtly; maintain continuity):"];

  if (memory.entities.length > 0) {
    const entityLines = memory.entities
      .slice(-12)
      .map((e) => `- ${e.name} (${e.kind}, last seen cycle ${e.lastCycle})`);
    lines.push("Known figures and places:", ...entityLines);
  }

  if (memory.beats.length > 0) {
    const beatLines = memory.beats
      .slice(-MEMORY_BEATS_IN_PROMPT)
      .map((b) => `- Cycle ${b.cycle}, turn ${b.turn}: ${b.summary}`);
    lines.push("Past beats:", ...beatLines);
  }

  return lines.join("\n");
}
