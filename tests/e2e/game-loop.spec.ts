import { test, expect } from "@playwright/test";
import {
  clearSave,
  clickFirstChoice,
  clickNeutralChoice,
  getBalanceMarkerLeft,
  seedRandom,
  startDemo,
  waitForScene,
} from "../helpers/fixtures";

test.describe("game loop", () => {
  test.beforeEach(async ({ page }) => {
    await clearSave(page);
    await seedRandom(page);
  });

  test("first scene renders narration and three choices", async ({ page }) => {
    await startDemo(page);

    await expect(page.getByTestId("narration")).not.toBeEmpty();
    await expect(page.getByTestId("choices").locator("button")).toHaveCount(3);
  });

  test("choosing advances to a new scene and moves the balance marker", async ({ page }) => {
    await startDemo(page);

    const narrationBefore = await page.getByTestId("narration").textContent();
    const markerBefore = await getBalanceMarkerLeft(page);

    await clickFirstChoice(page);
    await waitForScene(page);

    await expect(page.getByTestId("narration")).not.toHaveText(narrationBefore ?? "");
    await expect.poll(() => getBalanceMarkerLeft(page)).not.toBe(markerBefore);
  });

  test("repeated light choices update the balance descriptor", async ({ page }) => {
    await startDemo(page);

    await expect(page.getByTestId("balance-descriptor")).toHaveText(/near balance/i);

    await clickFirstChoice(page);
    await waitForScene(page);
    await clickFirstChoice(page);
    await waitForScene(page);

    await expect(page.getByTestId("balance-descriptor")).toHaveText(/Long Day/i);
  });

  test("phase flips after five turns", async ({ page }) => {
    await startDemo(page);

    await expect(page.getByTestId("phase-label")).toHaveText("☀ Long Day");

    for (let i = 0; i < 5; i++) {
      await clickFirstChoice(page);
      await waitForScene(page);
    }

    await expect(page.getByTestId("phase-label")).toHaveText("☾ Hush of Night");
  });

  test("day count increments when returning to day phase", async ({ page }) => {
    await startDemo(page);

    await expect(page.getByTestId("day-count")).toHaveText("Day 1");

    for (let i = 0; i < 10; i++) {
      await clickNeutralChoice(page);
      await waitForScene(page);
    }

    await expect(page.getByTestId("day-count")).toHaveText("Day 2");
  });
});
