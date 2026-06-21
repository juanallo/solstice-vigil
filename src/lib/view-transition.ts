import { flushSync } from "react-dom";

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

type ViewTransitionDocument = Document & {
  startViewTransition: (updateCallback: () => void) => { finished: Promise<void> };
};

export function withViewTransition(update: () => void): Promise<void> {
  if (!supportsViewTransitions()) {
    update();
    return Promise.resolve();
  }
  return (document as ViewTransitionDocument).startViewTransition(() => {
    flushSync(update);
  }).finished;
}
