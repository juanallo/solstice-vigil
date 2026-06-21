import { test, expect } from "@playwright/test";
import { pickEpicVoice } from "../../src/lib/speech-voice";

function mockVoice(
  name: string,
  lang: string,
  opts: { localService?: boolean; default?: boolean } = {},
) {
  return { name, lang, ...opts };
}

test.describe("pickEpicVoice", () => {
  test("returns null for empty list", () => {
    expect(pickEpicVoice([])).toBeNull();
  });

  test("prefers English over non-English", () => {
    const picked = pickEpicVoice([
      mockVoice("Yuki", "ja-JP"),
      mockVoice("Generic", "en-US"),
    ]);
    expect(picked?.name).toBe("Generic");
  });

  test("prefers en-GB and epic name hints", () => {
    const picked = pickEpicVoice([
      mockVoice("Google US English", "en-US"),
      mockVoice("Daniel", "en-GB", { localService: true }),
      mockVoice("Google UK English Female", "en-GB"),
    ]);
    expect(picked?.name).toBe("Daniel");
  });

  test("boosts premium/enhanced voices among English peers", () => {
    const picked = pickEpicVoice([
      mockVoice("Basic Voice", "en-US"),
      mockVoice("Samantha (Enhanced)", "en-US", { localService: true }),
    ]);
    expect(picked?.name).toBe("Samantha (Enhanced)");
  });
});
