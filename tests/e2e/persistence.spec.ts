import { test, expect } from "@playwright/test";
import { SAVE_KEY } from "../helpers/constants";
import {
  clearSave,
  clickFirstChoice,
  getSave,
  gotoTitle,
  midGameSave,
  seedSave,
  startDemo,
  waitForScene,
} from "../helpers/fixtures";

test.describe("persistence", () => {
  test("mid-game save persists across reload and continue restores state", async ({ page }) => {
    await clearSave(page);
    await startDemo(page);
    await clickFirstChoice(page);
    await waitForScene(page);

    const dayBefore = await page.getByTestId("day-count").textContent();
    const phaseBefore = await page.getByTestId("phase-label").textContent();
    const markerBefore = await page.getByTestId("balance-marker").evaluate((el) => el.style.left);

    await page.reload();
    await expect(page.getByRole("button", { name: "Continue the vigil" })).toBeVisible();
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await expect(page.getByTestId("day-count")).toHaveText(dayBefore ?? "");
    await expect(page.getByTestId("phase-label")).toHaveText(phaseBefore ?? "");
    await expect(page.getByTestId("balance-marker")).toHaveAttribute("style", /left:/);
    await expect(page.getByTestId("balance-marker")).toHaveJSProperty("style.left", markerBefore);
  });

  test("restart clears save and returns to title", async ({ page }) => {
    await clearSave(page);
    await startDemo(page);
    await page.getByRole("button", { name: "restart" }).click();

    await expect(page.getByRole("heading", { name: "SOLSTICE VIGIL" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue the vigil" })).toHaveCount(0);

    const save = await getSave(page);
    expect(save).toBeNull();
  });

  test("pre-seeded save enables continue", async ({ page }) => {
    await seedSave(page, midGameSave);
    await page.goto("/?demo=1");

    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await expect(page.getByTestId("day-count")).toHaveText("Day 2");
    await expect(page.getByTestId("phase-label")).toHaveText("☾ Hush of Night");

    const save = await getSave(page);
    expect(save?.cycle).toBe(1);
  });

  test("save key uses solstice-vigil-save schema", async ({ page }) => {
    await clearSave(page);
    await startDemo(page);
    await clickFirstChoice(page);
    await waitForScene(page);

    const save = await page.evaluate((key) => localStorage.getItem(key), SAVE_KEY);
    expect(save).toBeTruthy();

    const parsed = JSON.parse(save!);
    expect(parsed).toMatchObject({
      cycle: expect.any(Number),
      turn: expect.any(Number),
      phase: expect.stringMatching(/day|night/),
      balance: expect.any(Number),
    });
  });
});
