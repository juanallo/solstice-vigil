import { test, expect } from "@playwright/test";
import {
  clockmakerEncounterSave,
  clockmakerRepeatEncounterSave,
  gameOverWithWondersSave,
  getSave,
  seedSave,
  waitForScene,
} from "../helpers/fixtures";

test.describe("rare encounter", () => {
  test("forced encounter shows discovery interstitial with art", async ({ page }) => {
    await seedSave(page, clockmakerEncounterSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();

    await expect(page.getByTestId("encounter-discovery-screen")).toBeVisible();
    await expect(page.getByTestId("encounter-discovery-cycle")).toHaveText("Cycle 20");
    await expect(page.getByTestId("encounter-discovery-title")).toContainText(/First encounter with The Clockmaker/i);
    await expect(page.getByTestId("encounter-discovery-subtitle")).toContainText(/very few wanderers/i);
    await expect(page.locator(".sv-encounter-hero")).toBeVisible();
  });

  test("continue from discovery shows rare scene and records codex", async ({ page }) => {
    await seedSave(page, clockmakerEncounterSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();

    await expect(page.getByTestId("encounter-discovery-screen")).toBeVisible();
    await page.getByTestId("encounter-continue").click();
    await waitForScene(page);

    await expect(page.getByTestId("narration")).toContainText(/Clockmaker/i);

    await page.getByRole("button", { name: "Refuse the bargain" }).click();
    await waitForScene(page);

    const save = await getSave(page);
    expect(save?.encounter?.codex?.clockmaker).toMatchObject({
      firstSeenCycle: 20,
      timesSeen: 1,
    });
    expect(save?.encounter?.memories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "clockmaker-refused", encounterId: "clockmaker" }),
      ]),
    );
    await expect(page.getByTestId("wonders-count")).toHaveText("1 wonder witnessed");
  });

  test("share encounter clipboard fallback shows Copied!", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedSave(page, clockmakerEncounterSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();

    await expect(page.getByTestId("encounter-discovery-screen")).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });

    await page.getByTestId("encounter-share").click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/Cycle 20/i);
    expect(clipboardText).toMatch(/Clockmaker/i);
    expect(clipboardText).toMatch(/SOLSTICE VIGIL/i);
    expect(clipboardText).toMatch(/solstice-vigil-jalloron\.zocomputer\.io/);
  });

  test("repeat encounter uses alternate discovery and share copy", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedSave(page, clockmakerRepeatEncounterSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();

    await expect(page.getByTestId("encounter-discovery-title")).toContainText(/appears again/i);

    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });

    await page.getByTestId("encounter-share").click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/appeared again/i);
  });

  test("repeat encounter narration references prior memory", async ({ page }) => {
    await seedSave(page, clockmakerRepeatEncounterSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await page.getByTestId("encounter-continue").click();
    await waitForScene(page);

    await expect(page.getByTestId("narration")).toContainText(/refused the Clockmaker's bargain/i);
  });

  test("game over share includes wonder count", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedSave(page, gameOverWithWondersSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await page.getByRole("button", { name: /Feed the brazier|Stride boldly|Refuse the bargain/i }).first().click();

    await expect(page.getByTestId("gameover-screen")).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });

    await page.getByRole("button", { name: "Share your vigil" }).click();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/witnessed 2 rare wonders/i);
  });
});
