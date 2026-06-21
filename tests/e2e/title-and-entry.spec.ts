import { test, expect } from "@playwright/test";
import {
  clearSave,
  gotoTitle,
  seedSave,
  startDemo,
  startDemoFromLink,
  waitForScene,
  midGameSave,
} from "../helpers/fixtures";

test.describe("title and entry", () => {
  test.beforeEach(async ({ page }) => {
    await clearSave(page);
  });

  test("landing renders with begin and demo actions", async ({ page }) => {
    await gotoTitle(page);

    await expect(page.getByRole("heading", { name: "SOLSTICE VIGIL" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin the vigil" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Try demo mode/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue the vigil" })).toHaveCount(0);
  });

  test("continue is hidden without a save", async ({ page }) => {
    await gotoTitle(page);
    await expect(page.getByRole("button", { name: "Continue the vigil" })).toHaveCount(0);
  });

  test("continue appears when a save exists", async ({ page }) => {
    await seedSave(page, midGameSave);
    await gotoTitle(page);
    await expect(page.getByRole("button", { name: "Continue the vigil" })).toBeVisible();
  });

  test("demo query plus begin enters playable demo state", async ({ page }) => {
    await startDemo(page);

    await expect(page.getByText("demo", { exact: true })).toBeVisible();
    await expect(page.getByText("Day 1")).toBeVisible();
    await expect(page.getByText("☀ Long Day")).toBeVisible();
    await waitForScene(page);
  });

  test("demo link enters playable demo state", async ({ page }) => {
    await startDemoFromLink(page);

    await expect(page.getByText("demo", { exact: true })).toBeVisible();
    await expect(page.getByTestId("narration")).not.toBeEmpty();
    await expect(page.getByTestId("choices").locator("button")).toHaveCount(3);
  });
});
