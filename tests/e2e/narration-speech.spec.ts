import { test, expect } from "@playwright/test";
import {
  clearSave,
  clickFirstChoice,
  seedRandom,
  startDemo,
  waitForScene,
} from "../helpers/fixtures";

test.describe("narration speech", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const volumes: number[] = [];
      Object.defineProperty(HTMLMediaElement.prototype, "volume", {
        get() {
          return (this as HTMLMediaElement & { __svVolume?: number }).__svVolume ?? 0.6;
        },
        set(value: number) {
          (this as HTMLMediaElement & { __svVolume?: number }).__svVolume = value;
          volumes.push(value);
          (window as Window & { __svVolumes?: number[] }).__svVolumes = volumes;
        },
        configurable: true,
      });

      let activeUtterance: SpeechSynthesisUtterance | null = null;

      SpeechSynthesis.prototype.speak = function (utterance: SpeechSynthesisUtterance) {
        if (activeUtterance) {
          activeUtterance.onend?.(new Event("end") as SpeechSynthesisEvent);
        }
        activeUtterance = utterance;
        queueMicrotask(() => {
          utterance.onstart?.(new Event("start") as SpeechSynthesisEvent);
        });
        setTimeout(() => {
          if (activeUtterance === utterance) {
            utterance.onend?.(new Event("end") as SpeechSynthesisEvent);
            activeUtterance = null;
          }
        }, 500);
      };

      SpeechSynthesis.prototype.cancel = function () {
        if (activeUtterance) {
          activeUtterance.onend?.(new Event("end") as SpeechSynthesisEvent);
          activeUtterance = null;
        }
      };
    });

    await clearSave(page);
    await seedRandom(page);
  });

  test("does not autoplay by default and shows play control", async ({ page }) => {
    await startDemo(page);
    await waitForScene(page);

    const playButton = page.getByTestId("narration-play");
    const autoPlay = page.getByTestId("narration-autoplay");

    await expect(playButton).toBeVisible();
    await expect(autoPlay).not.toBeChecked();
    await expect(playButton).toHaveAttribute("aria-label", "Listen to narration");
    await expect(playButton).toHaveAttribute("aria-pressed", "false");
  });

  test("click replay enters speaking state and ducks music", async ({ page }) => {
    await startDemo(page);
    await waitForScene(page);

    const playButton = page.getByTestId("narration-play");
    await expect(playButton).toHaveAttribute("aria-pressed", "false");
    await playButton.click();

    await expect(playButton).toHaveAttribute("aria-pressed", "true");
    await expect(playButton).toHaveAttribute("aria-label", "Stop narration");

    const volumes = await page.evaluate(() => (window as Window & { __svVolumes?: number[] }).__svVolumes ?? []);
    expect(volumes.some((v) => v <= 0.2)).toBe(true);
  });

  test("stop button ends speaking and restores music volume", async ({ page }) => {
    await startDemo(page);
    await waitForScene(page);

    const playButton = page.getByTestId("narration-play");
    await expect(playButton).toHaveAttribute("aria-pressed", "false");
    await playButton.click();
    await expect(playButton).toHaveAttribute("aria-pressed", "true");

    await playButton.click();
    await expect(playButton).toHaveAttribute("aria-pressed", "false");
    await expect(playButton).toHaveAttribute("aria-label", "Listen to narration");

    const volumes = await page.evaluate(() => (window as Window & { __svVolumes?: number[] }).__svVolumes ?? []);
    expect(volumes.at(-1)).toBe(0.6);
  });

  test("clicking a choice stops narration in progress", async ({ page }) => {
    await startDemo(page);
    await waitForScene(page);

    const playButton = page.getByTestId("narration-play");
    await playButton.click();
    await expect(playButton).toHaveAttribute("aria-pressed", "true");

    await clickFirstChoice(page);
    await expect(playButton).toHaveAttribute("aria-pressed", "false");
    await expect(playButton).toHaveAttribute("aria-label", "Listen to narration");

    const volumes = await page.evaluate(() => (window as Window & { __svVolumes?: number[] }).__svVolumes ?? []);
    expect(volumes.at(-1)).toBe(0.6);
  });

  test("autoplay checkbox reads new scenes when enabled", async ({ page }) => {
    await startDemo(page);
    await waitForScene(page);

    await page.getByTestId("narration-autoplay").check();
    await expect(page.getByTestId("narration-autoplay")).toBeChecked();

    await clickFirstChoice(page);
    await waitForScene(page);

    await expect(page.getByTestId("narration-play")).toHaveAttribute("aria-pressed", "true");
  });

  test("autoplay preference persists in localStorage", async ({ page }) => {
    await startDemo(page);
    await waitForScene(page);

    await page.getByTestId("narration-autoplay").check();
    await page.reload();
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: "Begin the vigil" }).click();
    await waitForScene(page);

    await expect(page.getByTestId("narration-autoplay")).toBeChecked();
  });
});
