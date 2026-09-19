// jsdom omits a few browser APIs the UI touches. Stubbing them here rather than
// in each test keeps component tests from failing on environment gaps instead of
// on the behaviour under test.

// prefers-reduced-motion. jsdom has no matchMedia at all.
//
// The listener methods are real no-ops that ACCEPT registration rather than
// throwing, because startReducedMotionWatch subscribes to the query at app
// start. `matches: false` keeps every existing test on the full-motion path;
// tests that care about the reduced path install their own stub (see
// tests/state/reducedMotion.test.ts).
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
