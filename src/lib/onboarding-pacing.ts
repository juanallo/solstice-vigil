import type { EncounterId } from "../data/encounters";
import { identityForAlignmentTier, identityTitle } from "../data/identities";
import type { EncounterGameState } from "./encounters";
import {
  inferIdentity,
  MIN_DRIFT_SCORE,
  type IdentityGameState,
  type IdentityRecord,
} from "./identity";

export const INTRO_SHOWCASE_ENCOUNTER: EncounterId = "clockmaker";
export const INTRO_ENCOUNTER_MIN_TURN = 1; // after at least one player choice
export const INTRO_IDENTITY_MIN_CYCLE = 2; // HUD "Day 3"

export interface IntroEncounterGameState extends EncounterGameState {
  turn: number;
}

export function maybeSeedIntroEncounter<T extends IntroEncounterGameState>(state: T): T {
  const enc = state.encounter;
  if (state.turn < INTRO_ENCOUNTER_MIN_TURN) return state;
  if (Object.keys(enc.codex).length > 0) return state;
  if (enc.nextEncounterId) return state;

  return {
    ...state,
    encounter: {
      ...enc,
      nextEncounterId: INTRO_SHOWCASE_ENCOUNTER,
    },
  };
}

export function maybeForceIntroIdentity<T extends IdentityGameState>(state: T): T {
  if (state.identity.current) return state;
  if (state.pendingReveal) return state;
  if (state.cycle < INTRO_IDENTITY_MIN_CYCLE) return state;

  const inferred = inferIdentity(state);
  const id =
    inferred.dominantScore < MIN_DRIFT_SCORE
      ? identityForAlignmentTier(inferred.alignment, 1)
      : inferred.id;

  const record: IdentityRecord = {
    cycle: state.cycle,
    id,
    title: identityTitle(id),
  };

  return {
    ...state,
    identity: {
      current: id,
      history: [...state.identity.history, record],
    },
    pendingReveal: {
      id,
      cycle: state.cycle,
      kind: "become",
    },
    lastRevealCycle: state.cycle,
  };
}
