import { test, expect } from "@playwright/test";
import { freshEncounterState } from "../../src/lib/encounters";
import { freshIdentityState } from "../../src/lib/identity";
import {
  INTRO_ENCOUNTER_MIN_TURN,
  INTRO_IDENTITY_MIN_CYCLE,
  INTRO_SHOWCASE_ENCOUNTER,
  maybeForceIntroIdentity,
  maybeSeedIntroEncounter,
} from "../../src/lib/onboarding-pacing";

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    cycle: 0,
    turn: 0,
    balance: 0,
    rawTurns: [],
    identity: freshIdentityState(),
    pendingReveal: null,
    lastRevealCycle: -5,
    encounter: freshEncounterState(),
    ...overrides,
  };
}

test.describe("maybeSeedIntroEncounter", () => {
  test("skips before min turn", () => {
    const next = maybeSeedIntroEncounter(baseState({ turn: INTRO_ENCOUNTER_MIN_TURN - 1 }));
    expect(next.encounter.nextEncounterId).toBeUndefined();
  });

  test("sets nextEncounterId after min turn on empty codex", () => {
    const next = maybeSeedIntroEncounter(baseState({ turn: INTRO_ENCOUNTER_MIN_TURN }));
    expect(next.encounter.nextEncounterId).toBe(INTRO_SHOWCASE_ENCOUNTER);
  });

  test("skips when codex already has entries", () => {
    const next = maybeSeedIntroEncounter(
      baseState({
        turn: INTRO_ENCOUNTER_MIN_TURN,
        encounter: {
          ...freshEncounterState(),
          codex: { clockmaker: { firstSeenCycle: 0, timesSeen: 1 } },
        },
      }),
    );
    expect(next.encounter.nextEncounterId).toBeUndefined();
  });

  test("skips when nextEncounterId already set", () => {
    const next = maybeSeedIntroEncounter(
      baseState({
        turn: INTRO_ENCOUNTER_MIN_TURN,
        encounter: {
          ...freshEncounterState(),
          nextEncounterId: "last-bird",
        },
      }),
    );
    expect(next.encounter.nextEncounterId).toBe("last-bird");
  });
});

test.describe("maybeForceIntroIdentity", () => {
  test("fires at intro min cycle with no current identity", () => {
    const next = maybeForceIntroIdentity(
      baseState({
        cycle: INTRO_IDENTITY_MIN_CYCLE,
        rawTurns: [{ phase: "day", tone: "yang" }],
      }),
    );
    expect(next.pendingReveal).toMatchObject({
      cycle: INTRO_IDENTITY_MIN_CYCLE,
      kind: "become",
    });
    expect(next.identity.current).toBeTruthy();
    expect(next.identity.history).toHaveLength(1);
  });

  test("skips when cycle is below intro min", () => {
    const next = maybeForceIntroIdentity(
      baseState({
        cycle: INTRO_IDENTITY_MIN_CYCLE - 1,
        rawTurns: [{ phase: "day", tone: "yang" }],
      }),
    );
    expect(next.pendingReveal).toBeNull();
    expect(next.identity.current).toBeNull();
  });

  test("skips when identity already assigned", () => {
    const next = maybeForceIntroIdentity(
      baseState({
        cycle: INTRO_IDENTITY_MIN_CYCLE,
        identity: {
          current: "sun-walker",
          history: [{ cycle: 1, id: "sun-walker", title: "Sun-Walker" }],
        },
      }),
    );
    expect(next.pendingReveal).toBeNull();
    expect(next.identity.history).toHaveLength(1);
  });

  test("does not duplicate history on second call", () => {
    const once = maybeForceIntroIdentity(
      baseState({
        cycle: INTRO_IDENTITY_MIN_CYCLE,
        rawTurns: [{ phase: "day", tone: "yang" }],
      }),
    );
    const twice = maybeForceIntroIdentity({
      ...once,
      pendingReveal: null,
    });
    expect(twice.identity.history).toHaveLength(1);
    expect(twice.pendingReveal).toBeNull();
  });
});
