import { test, expect } from "@playwright/test";
import {
  clearSave,
  clickDiceChoice,
  clickNeutralChoice,
  clickStrongestYangChoice,
  getSave,
  seedRandom,
  startDemo,
  waitForScene,
} from "../helpers/fixtures";

test.describe("dice rolling", () => {
  test.beforeEach(async ({ page }) => {
    await clearSave(page);
    await seedRandom(page);
  });

  test("yang choice shows dice reveal with roll number", async ({ page }) => {
    await startDemo(page, { reducedMotion: false });

    const diceChoice = page.getByTestId("choice-dice");
    if ((await diceChoice.count()) === 0) {
      test.skip(true, "This scene has no dice option (Omen)");
    }
    await page.getByTestId("choice-dice").click();
    await expect(page.getByTestId("dice-reveal")).toBeVisible();
    await expect(page.getByTestId("dice-roll")).toBeVisible();
    await expect(page.getByTestId("dice-roll")).toHaveAttribute("src", /\/d20\/\d{2}\.webp$/);
    await expect(page.getByTestId("dice-tier-line")).not.toBeEmpty();
    await waitForScene(page);
  });

  test("at most one dice-marked choice per scene", async ({ page }) => {
    await startDemo(page, { reducedMotion: false });
    const count = await page.getByTestId("choice-dice").count();
    expect(count).toBeLessThanOrEqual(1);
    if (count === 1) {
      await expect(page.getByTestId("choice-dice")).toContainText(/Roll the dice to/i);
    }
  });

  test("neutral choice skips dice reveal", async ({ page }) => {
    await startDemo(page, { reducedMotion: false });

    await clickNeutralChoice(page);
    await expect(page.getByTestId("dice-reveal")).toHaveCount(0);
    await waitForScene(page);
  });

  test("yang choice persists roll metadata in save", async ({ page }) => {
    await startDemo(page);

    if ((await page.getByTestId("choice-dice").count()) === 0) {
      test.skip(true, "This scene has no dice option (Omen)");
    }
    await clickDiceChoice(page);
    await waitForScene(page);

    const save = await getSave(page);
    expect(save).not.toBeNull();
    const lastTurn = save!.rawTurns[save!.rawTurns.length - 1];
    expect(lastTurn.roll).toBeGreaterThanOrEqual(1);
    expect(lastTurn.roll).toBeLessThanOrEqual(20);
    expect(lastTurn.rollTier).toBeTruthy();
    expect(lastTurn.baseBalanceShift).toBeDefined();
  });

  test("seeded yang roll produces predictable shift", async ({ page }) => {
    await seedRandom(page, 0.42);
    await startDemo(page);

    await clickDiceChoice(page);
    await waitForScene(page);

    const save = await getSave(page);
    const lastTurn = save!.rawTurns[save!.rawTurns.length - 1];
    expect(lastTurn.roll).toBe(18);
    expect(lastTurn.rollTier).toBe("strong");
    expect(lastTurn.baseBalanceShift).toBe(-34);
    expect(lastTurn.balanceShift).toBe(-43);
  });
});
