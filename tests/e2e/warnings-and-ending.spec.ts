import { test, expect } from "@playwright/test";
import {
  clearSave,
  clickFirstChoice,
  clickStrongestYangChoice,
  clickStrongestYinChoice,
  getSave,
  longDayWarningSave,
  hushWarningSave,
  nearGameOverDaySave,
  nearGameOverNightSave,
  seedRandom,
  seedSave,
  startDemo,
  waitForScene,
} from "../helpers/fixtures";

test.describe("warnings and ending", () => {
  test.beforeEach(async ({ page }) => {
    await seedRandom(page);
  });

  test("seeded long day warning appears in demo", async ({ page }) => {
    await seedSave(page, longDayWarningSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await expect(page.getByTestId("balance-warning")).toHaveText("the light burns too bright…");
  });

  test("seeded hush warning appears in demo", async ({ page }) => {
    await seedSave(page, hushWarningSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await expect(page.getByTestId("balance-warning")).toHaveText("the Hush presses too deep…");
  });

  test("stagnation warning appears after repeated same-tone choices", async ({ page }) => {
    await clearSave(page);
    await startDemo(page);

    await clickStrongestYangChoice(page);
    await waitForScene(page);
    await clickStrongestYangChoice(page);
    await waitForScene(page);

    await expect(page.getByTestId("stagnation-warning")).toHaveText("the solstice grows restless…");
  });

  test("extreme long day choice ends the vigil", async ({ page }) => {
    await seedSave(page, nearGameOverDaySave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await clickStrongestYangChoice(page);

    await expect(page.getByTestId("gameover-screen")).toBeVisible();
    await expect(page.getByRole("heading", { name: "the vigil ends" })).toBeVisible();
    await expect(page.getByText(/The Long Day claims you/i)).toBeVisible();
  });

  test("extreme hush choice ends the vigil", async ({ page }) => {
    await seedSave(page, nearGameOverNightSave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);

    await clickStrongestYinChoice(page);

    await expect(page.getByTestId("gameover-screen")).toBeVisible();
    await expect(page.getByText(/The Hush takes you/i)).toBeVisible();
  });

  test("game over clears save and begin again starts a fresh vigil", async ({ page }) => {
    await seedSave(page, nearGameOverDaySave);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await waitForScene(page);
    await clickStrongestYangChoice(page);

    await expect(page.getByTestId("gameover-screen")).toBeVisible();
    expect(await getSave(page)).toBeNull();

    await page.getByRole("button", { name: "Begin again" }).click();
    await waitForScene(page);
    await expect(page.getByTestId("demo-badge")).toBeVisible();
  });
});
