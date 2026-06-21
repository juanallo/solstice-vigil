import type { IdentityId } from "../data/identities";
import { IDENTITIES } from "../data/identities";
import type { Archetype, Phase, Tone } from "./prompt";

export type RollTier = "fumble" | "backfire" | "intended" | "strong" | "critical";

export interface DiceAction {
  label: string;
  balanceShift: number;
  tone: Tone;
  requiresRoll?: boolean;
}

export interface DiceOutcome {
  roll: number;
  rawRoll: number;
  tier: RollTier;
  baseShift: number;
  resolvedShift: number;
  tierLine: string;
  oracleLine?: string;
}

interface TierDef {
  tier: RollTier;
  multiplier: number;
  invert: boolean;
}

export function shouldRoll(action: Pick<DiceAction, "requiresRoll">): boolean {
  return action.requiresRoll === true;
}

export function diceChoiceLabel(label: string): string {
  return `Roll the dice to ${label}`;
}

export function diceFacePath(roll: number): string {
  const n = Math.max(1, Math.min(20, Math.round(roll)));
  return `/d20/${String(n).padStart(2, "0")}.webp`;
}

/** Mark at most one bold action per scene for the d20. Omens stay dice-free. */
export function assignDiceAction<T extends DiceAction>(
  actions: T[],
  archetype: Archetype,
): Array<T & { requiresRoll: boolean }> {
  const cleared = actions.map((a) => ({ ...a, requiresRoll: false as boolean }));
  if (archetype === "Omen") return cleared;

  let bestIdx = -1;
  let bestMag = 0;
  for (let i = 0; i < cleared.length; i++) {
    const a = cleared[i];
    if (a.tone === "neutral" || a.balanceShift === 0) continue;
    const mag = Math.abs(a.balanceShift);
    if (mag > bestMag) {
      bestMag = mag;
      bestIdx = i;
    }
  }
  if (bestIdx === -1) return cleared;
  cleared[bestIdx] = { ...cleared[bestIdx], requiresRoll: true };
  return cleared;
}

export function tierFromRoll(n: number): TierDef {
  if (n <= 1) return { tier: "fumble", multiplier: 1, invert: true };
  if (n <= 5) return { tier: "backfire", multiplier: 1.5, invert: false };
  if (n <= 14) return { tier: "intended", multiplier: 1, invert: false };
  if (n <= 19) return { tier: "strong", multiplier: 1.25, invert: false };
  return { tier: "critical", multiplier: 1.5, invert: false };
}

export function tierLine(tier: RollTier): string {
  switch (tier) {
    case "fumble":
      return "The solstice rejects your step.";
    case "backfire":
      return "The wheel turns harder than you meant.";
    case "intended":
      return "The wheel holds your course.";
    case "strong":
      return "The vigil answers boldly.";
    case "critical":
      return "The sun and moon mark this moment.";
  }
}

export function identityRollBonus(
  identityId: IdentityId | null,
  tone: Tone,
  phase: Phase,
): number {
  if (!identityId) return 0;
  const alignment = IDENTITIES[identityId].alignment;
  if (alignment === "light" && tone === "yang" && phase === "day") return 1;
  if (alignment === "night" && tone === "yin" && phase === "night") return 1;
  return 0;
}

export function rollD20(rng: () => number, bonus: number): { rawRoll: number; roll: number } {
  const rawRoll = Math.floor(rng() * 20) + 1;
  if (rawRoll === 1 || rawRoll === 20) {
    return { rawRoll, roll: rawRoll };
  }
  const roll = Math.max(1, Math.min(20, rawRoll + bonus));
  return { rawRoll, roll };
}

export function resolveShift(baseShift: number, tier: TierDef): number {
  if (baseShift === 0) return 0;
  const magnitude = Math.abs(baseShift);
  const scaled = Math.round(magnitude * tier.multiplier);
  const signed = baseShift < 0 ? -scaled : scaled;
  return tier.invert ? -signed : signed;
}

const ORACLE_LINES: Record<RollTier, Partial<Record<`${Phase}-${Tone}`, string>>> = {
  fumble: {
    "day-yang": "The Long Day turns its face away.",
    "day-yin": "Even the Hush will not shelter a misstep.",
    "day-neutral": "The threshold splinters beneath you.",
    "night-yang": "Fire dies in halted air.",
    "night-yin": "The deep cold claims what you meant to keep.",
    "night-neutral": "The wheel slips from your hand.",
  },
  critical: {
    "day-yang": "Even the Hush remembers fire.",
    "day-yin": "Shadow bows to a rare grace.",
    "day-neutral": "The wheel sings your name once.",
    "night-yang": "A star stirs in endless dark.",
    "night-yin": "The Hush opens like a flower.",
    "night-neutral": "Balance leans to listen.",
  },
  backfire: {},
  intended: {},
  strong: {},
};

export function oracleLine(phase: Phase, tone: Tone, tier: RollTier): string | undefined {
  const table = ORACLE_LINES[tier];
  if (!table || Object.keys(table).length === 0) return undefined;
  return table[`${phase}-${tone}`] ?? table[`${phase}-neutral`];
}

export function resolveChoiceRoll(input: {
  baseShift: number;
  tone: Tone;
  phase: Phase;
  identityId: IdentityId | null;
  rng?: () => number;
}): DiceOutcome {
  const rng = input.rng ?? Math.random;
  const bonus = identityRollBonus(input.identityId, input.tone, input.phase);
  const { rawRoll, roll } = rollD20(rng, bonus);
  const tierDef = tierFromRoll(roll);
  const resolvedShift = resolveShift(input.baseShift, tierDef);
  const tier = tierDef.tier;

  return {
    roll,
    rawRoll,
    tier,
    baseShift: input.baseShift,
    resolvedShift,
    tierLine: tierLine(tier),
    oracleLine: oracleLine(input.phase, input.tone, tier),
  };
}
