import {
  type IdentityAlignment,
  type IdentityId,
  identityForAlignmentTier,
  identityTitle,
  identityAlignmentLabel,
  IDENTITIES,
} from "../data/identities";

export const MIN_CYCLES_FIRST_REVEAL = 12;
export const MIN_CYCLES_BETWEEN_REVEALS = 5;
export const ROLLING_TURN_WINDOW = 24;
export const TIER_STEP = 8;
export const MIN_DRIFT_SCORE = 10;

type Phase = "day" | "night";
type Tone = "yang" | "yin" | "neutral";

export interface IdentityTurnRecord {
  phase: Phase;
  tone: Tone;
}

export interface IdentityRecord {
  cycle: number;
  id: IdentityId;
  title: string;
}

export interface IdentityState {
  current: IdentityId | null;
  history: IdentityRecord[];
}

export interface PendingReveal {
  id: IdentityId;
  cycle: number;
  kind: "become" | "known";
}

export interface IdentityGameState {
  cycle: number;
  balance: number;
  rawTurns: IdentityTurnRecord[];
  identity: IdentityState;
  pendingReveal: PendingReveal | null;
  lastRevealCycle: number;
}

export interface AlignmentScores {
  light: number;
  night: number;
  balanced: number;
}

export interface InferredIdentity {
  id: IdentityId;
  alignment: IdentityAlignment;
  tier: number;
  scores: AlignmentScores;
  dominantScore: number;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function toneWeight(tone: Tone, phase: Phase): { light: number; night: number; balanced: number } {
  if (tone === "yang") {
    return phase === "night"
      ? { light: 3, night: 0, balanced: 0 }
      : { light: 2, night: 0, balanced: 0 };
  }
  if (tone === "yin") {
    return phase === "day"
      ? { light: 0, night: 3, balanced: 0 }
      : { light: 0, night: 2, balanced: 0 };
  }
  return { light: 0, night: 0, balanced: 2 };
}

export function computeAlignmentScores(state: Pick<IdentityGameState, "rawTurns" | "balance">): AlignmentScores {
  const turns = state.rawTurns.slice(-ROLLING_TURN_WINDOW);
  const scores: AlignmentScores = { light: 0, night: 0, balanced: 0 };

  for (const t of turns) {
    const w = toneWeight(t.tone, t.phase);
    scores.light += w.light;
    scores.night += w.night;
    scores.balanced += w.balanced;
  }

  const b = state.balance;
  if (b <= -20) scores.light += Math.min(6, Math.floor(Math.abs(b) / 15));
  else if (b >= 20) scores.night += Math.min(6, Math.floor(Math.abs(b) / 15));
  else scores.balanced += 3;

  return scores;
}

export function inferIdentity(state: Pick<IdentityGameState, "rawTurns" | "balance">): InferredIdentity {
  const scores = computeAlignmentScores(state);
  const entries: [IdentityAlignment, number][] = [
    ["light", scores.light],
    ["night", scores.night],
    ["balanced", scores.balanced],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const [alignment, dominantScore] = entries[0];
  const tier = clamp(Math.floor(dominantScore / TIER_STEP) + 1, 1, 4);
  const id = identityForAlignmentTier(alignment, tier);
  return { id, alignment, tier, scores, dominantScore };
}

export function freshIdentityState(): IdentityState {
  return { current: null, history: [] };
}

export function migrateIdentityFields(raw: Partial<IdentityGameState>): Pick<IdentityGameState, "identity" | "pendingReveal" | "lastRevealCycle"> {
  return {
    identity: raw.identity ?? freshIdentityState(),
    pendingReveal: raw.pendingReveal ?? null,
    lastRevealCycle: raw.lastRevealCycle ?? -MIN_CYCLES_BETWEEN_REVEALS,
  };
}

export function updateIdentity<T extends IdentityGameState>(state: T): T {
  const inferred = inferIdentity(state);
  const current = state.identity.current;

  if (inferred.dominantScore < MIN_DRIFT_SCORE) {
    return { ...state, pendingReveal: null };
  }

  const isFirst = current === null;
  const changed = current !== inferred.id;

  if (!changed) {
    return { ...state, pendingReveal: null };
  }

  const minCycles = isFirst ? MIN_CYCLES_FIRST_REVEAL : MIN_CYCLES_BETWEEN_REVEALS;
  if (state.cycle < minCycles) {
    return { ...state, pendingReveal: null };
  }
  if (!isFirst && state.cycle - state.lastRevealCycle < MIN_CYCLES_BETWEEN_REVEALS) {
    return { ...state, pendingReveal: null };
  }

  const record: IdentityRecord = {
    cycle: state.cycle,
    id: inferred.id,
    title: identityTitle(inferred.id),
  };

  return {
    ...state,
    identity: {
      current: inferred.id,
      history: [...state.identity.history, record],
    },
    pendingReveal: {
      id: inferred.id,
      cycle: state.cycle,
      kind: isFirst ? "become" : "known",
    },
    lastRevealCycle: state.cycle,
  };
}

export function buildIdentityPromptBlock(state: IdentityGameState): string | null {
  const current = state.identity.current;
  if (!current) return null;

  const def = IDENTITIES[current];
  const past = state.identity.history
    .filter((r) => r.id !== current)
    .slice(-4)
    .map((r) => `${r.title} (cycle ${r.cycle})`)
    .join(", ");

  const lines = [
    "IDENTITY (internal — weave subtly; never name mechanics to the player):",
    `Current bearing: ${def.title} (${identityAlignmentLabel(def.alignment)}).`,
  ];
  if (past) {
    lines.push(`The world remembers you were once: ${past}.`);
    lines.push('Occasionally echo former selves ("traces of the Ember Saint you once became").');
  }
  lines.push("Do not reference identity every scene.");
  return lines.join("\n");
}
