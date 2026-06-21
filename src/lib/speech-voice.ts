export const SPEECH_RATE = 0.88;
export const SPEECH_PITCH = 0.92;

const EPIC_HINTS = [
  "daniel",
  "serena",
  "samantha",
  "alex",
  "fred",
  "david",
  "mark",
  "premium",
  "enhanced",
  "natural",
];

export interface VoiceLike {
  name: string;
  lang: string;
  localService?: boolean;
  default?: boolean;
}

function scoreVoice(voice: VoiceLike): number {
  let score = 0;
  const name = voice.name.toLowerCase();
  const lang = voice.lang.toLowerCase();

  if (lang.startsWith("en")) score += 10;
  if (lang.includes("gb")) score += 5;

  for (const hint of EPIC_HINTS) {
    if (name.includes(hint)) score += 8;
  }

  if (voice.localService) score += 2;
  if (!voice.default) score += 1;

  return score;
}

export function pickEpicVoice<T extends VoiceLike>(voices: T[]): T | null {
  if (!voices.length) return null;

  let best = voices[0];
  let bestScore = scoreVoice(best);

  for (let i = 1; i < voices.length; i++) {
    const candidate = voices[i];
    const candidateScore = scoreVoice(candidate);
    if (candidateScore > bestScore) {
      best = candidate;
      bestScore = candidateScore;
    }
  }

  return best;
}
