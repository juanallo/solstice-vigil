const EXCLUDED_TEST_IDS = new Set([
  'audio-toggle',
  'narration-play',
  'narration-autoplay',
  'identity-badge',
]);

const EXCLUDED_TEXT = /^(restart|♪|▶)$/i;

/** Scene choice buttons only — excludes audio, narration, and HUD controls. */
export function getSceneChoices(btnPositions) {
  if (!btnPositions?.length) return [];

  return btnPositions.filter((b) => {
    if (!b.text?.trim()) return false;
    if (b.testId && EXCLUDED_TEST_IDS.has(b.testId)) return false;
    if (EXCLUDED_TEXT.test(b.text.trim())) return false;
    if (/^(Share this moment|Share your vigil|Continue the vigil|Try demo|Begin the vigil|Begin again|Copied!)$/i.test(b.text.trim())) {
      return false;
    }
    return true;
  });
}

export function getTargetButton(frameData) {
  const { clickTarget, btnPositions } = frameData;
  if (!btnPositions?.length) return null;

  if (clickTarget) {
    if (clickTarget.testId) {
      const match = btnPositions.find((b) => b.testId === clickTarget.testId);
      if (match) return match;
    }
    if (clickTarget.role) {
      const pattern = new RegExp(clickTarget.role, 'i');
      const match = btnPositions.find((b) => pattern.test(b.text));
      if (match) return match;
    }
    if (typeof clickTarget.choiceIdx === 'number') {
      const pool = getSceneChoices(btnPositions);
      if (clickTarget.choiceIdx >= 0 && clickTarget.choiceIdx < pool.length) {
        return pool[clickTarget.choiceIdx];
      }
    }
  }

  return getSceneChoices(btnPositions)[0]
    ?? btnPositions.find((b) => b.text && /Roll the dice|Refuse|Continue|Begin|Try demo/i.test(b.text))
    ?? null;
}
