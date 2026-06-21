import { test, expect } from "@playwright/test";
import {
  clickStrongestYangChoice,
  nearGameOverDaySave,
  seedSave,
  waitForScene,
} from "../helpers/fixtures";

test.describe("share", () => {
  test("clipboard fallback shows Copied!", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedSave(page, nearGameOverDaySave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);
    await clickStrongestYangChoice(page);

    await expect(page.getByTestId("gameover-screen")).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });

    await page.getByRole("button", { name: "Share your vigil" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/held the solstice vigil/i);
    expect(clipboardText).toMatch(/solstice-vigil-jalloron\.zocomputer\.io/);
  });
});
