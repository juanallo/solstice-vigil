import { test, expect } from "@playwright/test";
import {
  assignDiceAction,
  diceChoiceLabel,
  diceFacePath,
  identityRollBonus,
  resolveChoiceRoll,
  resolveShift,
  rollD20,
  shouldRoll,
  tierFromRoll,
  tierLine,
} from "../../src/lib/dice";

test.describe("dice", () => {
  test("shouldRoll is true only when requiresRoll is set", () => {
    expect(shouldRoll({ requiresRoll: true })).toBe(true);
    expect(shouldRoll({ requiresRoll: false })).toBe(false);
    expect(shouldRoll({})).toBe(false);
  });

  test("diceChoiceLabel prefixes the action", () => {
    expect(diceChoiceLabel("stride boldly")).toBe("Roll the dice to stride boldly");
  });

  test("diceFacePath maps rolls to zero-padded assets", () => {
    expect(diceFacePath(1)).toBe("/d20/01.webp");
    expect(diceFacePath(18)).toBe("/d20/18.webp");
    expect(diceFacePath(20)).toBe("/d20/20.webp");
    expect(diceFacePath(99)).toBe("/d20/20.webp");
  });

  test("assignDiceAction marks one bold action and skips Omen", () => {
    const threshold = assignDiceAction(
      [
        { label: "a", balanceShift: -38, tone: "yang" },
        { label: "b", balanceShift: 38, tone: "yin" },
        { label: "c", balanceShift: 0, tone: "neutral" },
      ],
      "Threshold",
    );
    expect(threshold.filter((a) => a.requiresRoll)).toHaveLength(1);
    expect(threshold[0].requiresRoll).toBe(true);

    const omen = assignDiceAction(
      [
        { label: "a", balanceShift: -8, tone: "yang" },
        { label: "b", balanceShift: 8, tone: "yin" },
        { label: "c", balanceShift: 0, tone: "neutral" },
      ],
      "Omen",
    );
    expect(omen.every((a) => !a.requiresRoll)).toBe(true);
  });

  test("assignDiceAction picks largest magnitude on Temptation", () => {
    const actions = assignDiceAction(
      [
        { label: "a", balanceShift: -28, tone: "yang" },
        { label: "b", balanceShift: -22, tone: "yang" },
        { label: "c", balanceShift: 10, tone: "yin" },
      ],
      "Temptation",
    );
    expect(actions[0].requiresRoll).toBe(true);
    expect(actions[1].requiresRoll).toBeFalsy();
  });

  test("tierFromRoll maps boundary values", () => {
    expect(tierFromRoll(1).tier).toBe("fumble");
    expect(tierFromRoll(2).tier).toBe("backfire");
    expect(tierFromRoll(5).tier).toBe("backfire");
    expect(tierFromRoll(6).tier).toBe("intended");
    expect(tierFromRoll(14).tier).toBe("intended");
    expect(tierFromRoll(15).tier).toBe("strong");
    expect(tierFromRoll(19).tier).toBe("strong");
    expect(tierFromRoll(20).tier).toBe("critical");
  });

  test("fumble inverts shift direction", () => {
    const tier = tierFromRoll(1);
    expect(resolveShift(-38, tier)).toBe(38);
    expect(resolveShift(38, tier)).toBe(-38);
  });

  test("multipliers apply to magnitude", () => {
    expect(resolveShift(-40, tierFromRoll(5))).toBe(-60);
    expect(resolveShift(-40, tierFromRoll(14))).toBe(-40);
    expect(resolveShift(-40, tierFromRoll(15))).toBe(-50);
    expect(resolveShift(-40, tierFromRoll(20))).toBe(-60);
  });

  test("identityRollBonus grants +1 for aligned light/day yang", () => {
    expect(identityRollBonus("dawnkeeper", "yang", "day")).toBe(1);
    expect(identityRollBonus("dawnkeeper", "yang", "night")).toBe(0);
    expect(identityRollBonus("dream-shepherd", "yin", "night")).toBe(1);
    expect(identityRollBonus("wheelkeeper", "yang", "day")).toBe(0);
  });

  test("rollD20 ignores bonus on nat 1 and nat 20", () => {
    let i = 0;
    const rolls = [0, 0.95, 0.05];
    const rng = () => rolls[i++] ?? 0.5;
    expect(rollD20(rng, 1)).toEqual({ rawRoll: 1, roll: 1 });
    expect(rollD20(() => 0.95, 1)).toEqual({ rawRoll: 20, roll: 20 });
    expect(rollD20(() => 0.5, 1)).toEqual({ rawRoll: 11, roll: 12 });
  });

  test("resolveChoiceRoll returns oracle on critical", () => {
    const outcome = resolveChoiceRoll({
      baseShift: -30,
      tone: "yang",
      phase: "day",
      identityId: null,
      rng: () => 0.95,
    });
    expect(outcome.tier).toBe("critical");
    expect(outcome.oracleLine).toBeTruthy();
    expect(outcome.tierLine).toBe(tierLine("critical"));
  });
});
