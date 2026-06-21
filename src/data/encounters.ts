import type { IdentityAlignment, IdentityId } from "./identities";
import type { Phase, Tone } from "../lib/prompt";

export type EncounterKind = "character" | "place" | "event";

export type EncounterId =
  | "clockmaker"
  | "last-bird"
  | "sleepless-king"
  | "cartographer-of-forgotten-paths"
  | "child-beneath-the-ice"
  | "frozen-observatory"
  | "garden-of-unspoken-names"
  | "library-without-shadows"
  | "sea-of-ashen-mirrors"
  | "tower-at-the-edge-of-noon"
  | "lunar-eclipse"
  | "falling-stars"
  | "a-day-where-the-wind-speaks"
  | "a-bridge-that-exists-only-once-every-hundred-cycles"
  | "return-of-someone-abandoned-long-ago";

export interface EncounterAction {
  label: string;
  balanceShift: number;
  tone: Tone;
  memory?: { key: string; label: string };
}

export interface EncounterRequirements {
  phase?: Phase | "either";
  minCycle?: number;
  identityAlignment?: IdentityAlignment;
  identityIds?: IdentityId[];
  maxAbsBalance?: number;
  minBalance?: number;
  maxBalance?: number;
  requiresMemories?: boolean;
  requiresCodex?: EncounterId;
  scheduledCycleMod?: number;
}

export interface EncounterDef {
  title: string;
  kind: EncounterKind;
  tagline: string;
  image: string;
  requirements: EncounterRequirements;
  firstWeight: number;
  repeatWeight: number;
  fallback: (phase: Phase, isRepeat: boolean, memoryLabels: string[]) => {
    narration: string;
    actions: EncounterAction[];
  };
}

export const ENCOUNTERS: Record<EncounterId, EncounterDef> = {
  clockmaker: {
    title: "The Clockmaker",
    kind: "character",
    tagline: "He mends what time has forgotten. He offers bargains wrapped in seconds.",
    image: "/encounters/clockmaker.png",
    requirements: { phase: "either", minCycle: 20 },
    firstWeight: 1.2,
    repeatWeight: 0.4,
    fallback: (_phase, isRepeat, memories) => {
      const recall = isRepeat && memories.length > 0
        ? ` He remembers that ${memories[0]}.`
        : "";
      return {
        narration: `A workshop appears where no road should be. The Clockmaker hunches over gears that turn without cause, candlelight pooling in the hollows of his face.${recall} "One second from your vigil," he offers, "for one truth you have not earned."`,
        actions: [
          { label: "Refuse the bargain", balanceShift: 0, tone: "neutral", memory: { key: "clockmaker-refused", label: "refused the Clockmaker's bargain" } },
          { label: "Offer a moment of your vigil", balanceShift: 8, tone: "yin", memory: { key: "clockmaker-paid", label: "paid the Clockmaker with a moment of vigil" } },
          { label: "Ask what he mends", balanceShift: -5, tone: "yang" },
        ],
      };
    },
  },
  "last-bird": {
    title: "The Last Bird",
    kind: "character",
    tagline: "It sings of a dawn that may never come again. Listen closely.",
    image: "/encounters/last-bird.png",
    requirements: { phase: "day", minCycle: 18 },
    firstWeight: 1,
    repeatWeight: 0.5,
    fallback: () => ({
      narration: "On a branch of black glass, a single white bird opens its beak. The song is thin, ancient, and full of mornings that have not happened. It watches you as though you might remember how to bring them back.",
      actions: [
        { label: "Listen until the song ends", balanceShift: -6, tone: "yang" },
        { label: "Turn away from the sorrow", balanceShift: 10, tone: "yin" },
        { label: "Hum a counter-melody", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "sleepless-king": {
    title: "The Sleepless King",
    kind: "character",
    tagline: "He has watched the sun stand still for so long he no longer remembers what dreams are.",
    image: "/encounters/sleepless-king.png",
    requirements: { phase: "night", minCycle: 25, identityAlignment: "night" },
    firstWeight: 1,
    repeatWeight: 0.45,
    fallback: () => ({
      narration: "A throne of frost stands in an empty hall. The Sleepless King does not blink. \"I held the wheel before you,\" he says. \"Tell me what you still dream of, wanderer, before the Hush takes even that.\"",
      actions: [
        { label: "Confess what you still dream of", balanceShift: 12, tone: "yin" },
        { label: "Refuse to kneel", balanceShift: -8, tone: "yang" },
        { label: "Ask how long he has watched", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "cartographer-of-forgotten-paths": {
    title: "The Cartographer of Forgotten Paths",
    kind: "character",
    tagline: "He draws maps to places that exist only when you are not looking.",
    image: "/encounters/cartographer-of-forgotten-paths.png",
    requirements: { phase: "either", minCycle: 22 },
    firstWeight: 1,
    repeatWeight: 0.5,
    fallback: () => ({
      narration: "By candlelight, a hooded figure inks a map that keeps changing. \"This path,\" he murmurs, \"only appears when the wanderer has forgotten why they walk. You are not there yet — but close.\"",
      actions: [
        { label: "Take the map he offers", balanceShift: -10, tone: "yang" },
        { label: "Refuse to forget the way", balanceShift: 8, tone: "yin" },
        { label: "Ask where the path leads", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "child-beneath-the-ice": {
    title: "The Child Beneath the Ice",
    kind: "character",
    tagline: "They wait in a world that stopped listening. Bring warmth. Or not.",
    image: "/encounters/child-beneath-the-ice.png",
    requirements: { phase: "night", minCycle: 20 },
    firstWeight: 1.1,
    repeatWeight: 0.45,
    fallback: () => ({
      narration: "Through cracked ice, a child's face looks up — not drowning, only waiting. A blue light pulses in their cupped hands. \"It is cold where you stand,\" they say. \"It is colder where I am.\"",
      actions: [
        { label: "Break the ice and reach down", balanceShift: -12, tone: "yang" },
        { label: "Leave them to the Hush", balanceShift: 14, tone: "yin" },
        { label: "Press your palm to the ice", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "frozen-observatory": {
    title: "The Frozen Observatory",
    kind: "place",
    tagline: "Its lenses are turned toward a sky that never changes. Still, it watches.",
    image: "/encounters/frozen-observatory.png",
    requirements: { phase: "night", minCycle: 18 },
    firstWeight: 1,
    repeatWeight: 0.5,
    fallback: () => ({
      narration: "A domed tower crowns a cliff of ice. Green fire ripples in the sky above it, though the stars do not move. The great lens inside still tracks a sun that refuses to set.",
      actions: [
        { label: "Peer through the lens", balanceShift: -8, tone: "yang" },
        { label: "Turn from what it shows", balanceShift: 10, tone: "yin" },
        { label: "Leave an offering at the door", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "garden-of-unspoken-names": {
    title: "The Garden of Unspoken Names",
    kind: "place",
    tagline: "Every flower here remembers a name the world has forgotten.",
    image: "/encounters/garden-of-unspoken-names.png",
    requirements: { phase: "either", minCycle: 20 },
    firstWeight: 1,
    repeatWeight: 0.5,
    fallback: () => ({
      narration: "Blue and white blossoms line a path to a stone arch. Each flower trembles when you pass, as if whispering a name you once knew. The air tastes of old promises.",
      actions: [
        { label: "Speak a name you remember", balanceShift: -6, tone: "yang" },
        { label: "Let the names stay unspoken", balanceShift: 8, tone: "yin" },
        { label: "Gather one blossom", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "library-without-shadows": {
    title: "The Library Without Shadows",
    kind: "place",
    tagline: "Books of light, written in ink that never dries. No night has ever touched these pages.",
    image: "/encounters/library-without-shadows.png",
    requirements: { phase: "day", minCycle: 22, maxBalance: -30 },
    firstWeight: 1,
    repeatWeight: 0.45,
    fallback: () => ({
      narration: "Golden light pours through windows that have never known dusk. Shelves climb toward a ceiling of pure noon. The books glow faintly, and nowhere does a shadow fall.",
      actions: [
        { label: "Read until your eyes burn", balanceShift: -14, tone: "yang" },
        { label: "Step back into the world of shade", balanceShift: 12, tone: "yin" },
        { label: "Copy one line in the margin", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "sea-of-ashen-mirrors": {
    title: "The Sea of Ashen Mirrors",
    kind: "place",
    tagline: "It reflects what was, what is, and what cannot be.",
    image: "/encounters/sea-of-ashen-mirrors.png",
    requirements: { phase: "either", minCycle: 22, minBalance: 30 },
    firstWeight: 1,
    repeatWeight: 0.45,
    fallback: () => ({
      narration: "Still water stretches to the horizon, grey as cooled ash. Every ripple holds a reflection that is not quite yours — younger, older, or never born. The Hush lies deep beneath the surface.",
      actions: [
        { label: "Wade into the mirrors", balanceShift: 16, tone: "yin" },
        { label: "Shatter your reflection", balanceShift: -10, tone: "yang" },
        { label: "Watch without touching", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "tower-at-the-edge-of-noon": {
    title: "The Tower at the Edge of Noon",
    kind: "place",
    tagline: "Where the sun leans closest to the end of the world. Few find it. Fewer leave.",
    image: "/encounters/tower-at-the-edge-of-noon.png",
    requirements: { phase: "day", minCycle: 30, identityAlignment: "balanced", maxAbsBalance: 25 },
    firstWeight: 0.8,
    repeatWeight: 0.35,
    fallback: () => ({
      narration: "A lone tower stands where the land ends in cloud and gold. The sun hangs at its shoulder, neither rising nor falling. From here, the whole vigil looks small enough to hold in one hand.",
      actions: [
        { label: "Climb toward the leaning sun", balanceShift: -12, tone: "yang" },
        { label: "Descend before the edge claims you", balanceShift: 10, tone: "yin" },
        { label: "Stand at the threshold and breathe", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "lunar-eclipse": {
    title: "Lunar Eclipse",
    kind: "event",
    tagline: "The hush briefly swallows the long day. Everything changes.",
    image: "/encounters/lunar-eclipse.png",
    requirements: { phase: "night", minCycle: 20, identityAlignment: "night" },
    firstWeight: 1,
    repeatWeight: 0.4,
    fallback: () => ({
      narration: "The frozen moon darkens at its edge. A ring of white fire blooms where its face should be. For a breath, the Long Day falters — and the Hush grows teeth.",
      actions: [
        { label: "Open yourself to the eclipse", balanceShift: 14, tone: "yin" },
        { label: "Will the light to return", balanceShift: -12, tone: "yang" },
        { label: "Mark the moment in silence", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "falling-stars": {
    title: "Falling Stars",
    kind: "event",
    tagline: "Wishes burn in the sky. Some are heard. Most are not.",
    image: "/encounters/falling-stars.png",
    requirements: { phase: "night", minCycle: 15 },
    firstWeight: 1.2,
    repeatWeight: 0.5,
    fallback: () => ({
      narration: "Streaks of fire tear across the unmoving sky — not one, but dozens, falling toward a world that has forgotten how to change. Each leaves a trail that lingers like a question.",
      actions: [
        { label: "Make a wish you dare not speak", balanceShift: -8, tone: "yang" },
        { label: "Let the wishes fall unanswered", balanceShift: 10, tone: "yin" },
        { label: "Watch until the last trail fades", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "a-day-where-the-wind-speaks": {
    title: "A Day Where the Wind Speaks",
    kind: "event",
    tagline: "It knows your name, your doubts, and what you fear to become.",
    image: "/encounters/a-day-where-the-wind-speaks.png",
    requirements: { phase: "day", minCycle: 18 },
    firstWeight: 1,
    repeatWeight: 0.45,
    fallback: () => ({
      narration: "The air moves though nothing stirs. The wind speaks in a voice almost yours: your name, your doubts, the shape of what you might become if the wheel stops turning.",
      actions: [
        { label: "Answer the wind aloud", balanceShift: -10, tone: "yang" },
        { label: "Cover your ears and walk on", balanceShift: 12, tone: "yin" },
        { label: "Listen without replying", balanceShift: 0, tone: "neutral" },
      ],
    }),
  },
  "a-bridge-that-exists-only-once-every-hundred-cycles": {
    title: "A Bridge That Exists Only Once Every Hundred Cycles",
    kind: "event",
    tagline: "Cross it, and something you lost may call to you again.",
    image: "/encounters/a-bridge-that-exists-only-once-every-hundred-cycles.png",
    requirements: { phase: "either", minCycle: 100, scheduledCycleMod: 100 },
    firstWeight: 10,
    repeatWeight: 0,
    fallback: () => ({
      narration: "Mist parts over a canyon that was not here yesterday. A stone bridge spans the void — ancient, impossible, already fading at its edges. Something on the far side calls your name.",
      actions: [
        { label: "Cross before it vanishes", balanceShift: 0, tone: "neutral", memory: { key: "bridge-crossed", label: "crossed the century bridge" } },
        { label: "Turn back from the calling", balanceShift: 8, tone: "yin" },
        { label: "Call out to what waits", balanceShift: -6, tone: "yang" },
      ],
    }),
  },
  "return-of-someone-abandoned-long-ago": {
    title: "The Return of Someone Abandoned Long Ago",
    kind: "event",
    tagline: "They remember. You may not like what they say.",
    image: "/encounters/return-of-someone-abandoned-long-ago.png",
    requirements: { phase: "either", minCycle: 35, requiresMemories: true },
    firstWeight: 0.9,
    repeatWeight: 0.4,
    fallback: (_phase, _isRepeat, memories) => {
      const recall = memories.length > 0 ? memories[memories.length - 1] : "an old choice";
      return {
        narration: `A figure waits on a road you swore you would never walk again. Their hood falls back. "You left me when you ${recall}," they say. "The wheel turns. I have turned with it."`,
        actions: [
          { label: "Ask their forgiveness", balanceShift: 10, tone: "yin" },
          { label: "Deny that you abandoned anyone", balanceShift: -8, tone: "yang" },
          { label: "Stand in silence between you", balanceShift: 0, tone: "neutral" },
        ],
      };
    },
  },
};

export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS) as EncounterId[];

export function encounterTitle(id: EncounterId): string {
  return ENCOUNTERS[id].title;
}

export function encounterKindLabel(kind: EncounterKind): string {
  if (kind === "character") return "A wonder seen by very few wanderers.";
  if (kind === "place") return "A place seen by very few wanderers.";
  return "A phenomenon seen by very few wanderers.";
}
