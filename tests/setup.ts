// jsdom omits a few browser APIs the UI touches. Stubbing them here rather than
// in each test keeps component tests from failing on environment gaps instead of
// on the behaviour under test.

// Several components read prefers-reduced-motion directly (RaceResult's confetti,
// TrackCanvas). jsdom has no matchMedia at all.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, // tests exercise the full-motion path unless overridden
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}
