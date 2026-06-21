import { test, expect } from "@playwright/test";
import {
  clickStrongestYangChoice,
  identityHeavyLightSave,
  seedSave,
  waitForScene,
} from "../helpers/fixtures";

test.describe("identity reveal", () => {
  test("light-aligned play triggers identity reveal card", async ({ page }) => {
    await seedSave(page, identityHeavyLightSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await clickStrongestYangChoice(page);

    await expect(page.getByTestId("identity-reveal-screen")).toBeVisible();
    await expect(page.getByTestId("identity-reveal-cycle")).toHaveText("Cycle 12");
    await expect(page.getByTestId("identity-reveal-title")).toContainText(/You have become a/i);
    await expect(page.getByTestId("identity-reveal-title")).toContainText(/Flame Herald|Ember Saint|Dawnkeeper|Sun-Walker/);
    await expect(page.locator(".sv-identity-hero")).toBeVisible();
  });

  test("continue from reveal returns to playing with identity in HUD", async ({ page }) => {
    await seedSave(page, identityHeavyLightSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);
    await clickStrongestYangChoice(page);

    await expect(page.getByTestId("identity-reveal-screen")).toBeVisible();
    await page.getByTestId("identity-continue").click();
    await waitForScene(page);

    await expect(page.getByTestId("identity-badge")).toBeVisible();
    await expect(page.getByTestId("identity-label")).toBeVisible();
    await expect(page.locator(".sv-identity-portrait")).toBeVisible();
    await expect(page.getByTestId("narration")).toBeVisible();
  });

  test("share identity clipboard fallback shows Copied!", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await seedSave(page, identityHeavyLightSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);
    await clickStrongestYangChoice(page);

    await expect(page.getByTestId("identity-reveal-screen")).toBeVisible();

    await page.evaluate(() => {
      Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    });

    await page.getByRole("button", { name: "Share this moment" }).click();
    await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();

    const clipboardText = await page.evaluate(async () => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/Cycle 12/i);
    expect(clipboardText).toMatch(/SOLSTICE VIGIL/i);
    expect(clipboardText).toMatch(/solstice-vigil-jalloron\.zocomputer\.io/);
  });
});
