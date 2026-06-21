import { test, expect } from "@playwright/test";
import {
  clearSave,
  clickNeutralChoice,
  clockmakerRepeatEncounterSave,
  dismissDiscoveryIfPresent,
  seedRandom,
  seedSave,
  startDemo,
  waitForScene,
} from "../helpers/fixtures";

async function playThroughIntroEncounter(page: import("@playwright/test").Page) {
  await clickNeutralChoice(page);
  await expect(page.getByTestId("encounter-discovery-screen")).toBeVisible();
  await expect(page.getByTestId("encounter-discovery-title")).toContainText(/Clockmaker/i);
  await page.getByTestId("encounter-continue").click();
  await waitForScene(page);
  await expect(page.getByTestId("narration")).toContainText(/Clockmaker/i);
}

test.describe("onboarding pacing", () => {
  test.beforeEach(async ({ page }) => {
    await clearSave(page);
    await seedRandom(page);
  });

  test("fresh start shows a normal scene before intro encounter", async ({ page }) => {
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Begin the vigil" }).click();

    await expect(page.getByTestId("encounter-discovery-screen")).not.toBeVisible();
    await expect(page.getByTestId("narration")).toBeVisible();
    await expect(page.getByTestId("narration")).not.toContainText(/Clockmaker/i);
  });

  test("intro encounter appears after the first choice", async ({ page }) => {
    await startDemo(page);
    await playThroughIntroEncounter(page);
    await expect(page.locator(".sv-encounter-hero")).not.toBeVisible();
  });

  test("identity reveal fires by day 3 after intro encounter", async ({ page }) => {
    test.setTimeout(120_000);
    await startDemo(page);
    await playThroughIntroEncounter(page);

    for (let i = 0; i < 3; i++) {
      await clickNeutralChoice(page);
      if (i < 2) await waitForScene(page);
    }

    await expect(page.getByTestId("identity-reveal-screen")).toBeVisible();
  });

  test("after intro beats play continues with identity badge and no second forced discovery", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await startDemo(page);
    await playThroughIntroEncounter(page);

    for (let i = 0; i < 3; i++) {
      await clickNeutralChoice(page);
      if (i < 2) await waitForScene(page);
    }

    await expect(page.getByTestId("identity-reveal-screen")).toBeVisible();
    await page.getByTestId("identity-continue").click();
    await waitForScene(page);

    await expect(page.getByTestId("identity-badge")).toBeVisible();
    await expect(page.getByTestId("encounter-discovery-screen")).not.toBeVisible();

    await clickNeutralChoice(page);
    await waitForScene(page);

    await expect(page.getByTestId("encounter-discovery-screen")).not.toBeVisible();
    await expect(page.getByTestId("narration")).toBeVisible();
  });

  test("resume with existing codex does not force intro discovery", async ({ page }) => {
    const save = {
      ...clockmakerRepeatEncounterSave,
      encounter: {
        ...clockmakerRepeatEncounterSave.encounter!,
        nextEncounterId: undefined,
        pendingDiscovery: null,
        activeEncounterId: null,
      },
    };
    await seedSave(page, save);
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Continue the vigil" }).click();
    await dismissDiscoveryIfPresent(page);
    await waitForScene(page);

    await expect(page.getByTestId("encounter-discovery-screen")).not.toBeVisible();
    await expect(page.getByTestId("wonders-count")).toHaveText("1 wonder witnessed");
  });
});
