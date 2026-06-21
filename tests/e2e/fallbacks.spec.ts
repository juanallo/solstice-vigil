import { test, expect } from "@playwright/test";
import { clearSave, gotoTitle } from "../helpers/fixtures";

test.describe("fallbacks", () => {
  test("no WebGPU path offers demo mode", async ({ page }) => {
    await clearSave(page);
    await page.goto("/?nowebgpu=1");
    await page.getByRole("button", { name: "Begin the vigil" }).click();

    await expect(page.getByRole("heading", { name: /This vigil needs WebGPU/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play in demo mode" })).toBeVisible();
  });

  test("nosupport screen returns to title via back", async ({ page }) => {
    await clearSave(page);
    await page.goto("/?nowebgpu=1");
    await page.getByRole("button", { name: "Begin the vigil" }).click();
    await page.getByRole("button", { name: "Back" }).click();

    await expect(page.getByRole("heading", { name: "SOLSTICE VIGIL" })).toBeVisible();
  });
});
