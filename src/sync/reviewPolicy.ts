/**
 * When to ask for a review, as a pure function.
 *
 * The rule is about WHEN, not how often: Google throttles whether the sheet
 * actually appears and gives no way to find out. So our job is to ask at a
 * moment the player is pleased, and never at a moment they are not.
 *
 * Asking after a loss, a retirement, or on launch is the thing this exists to
 * prevent. A prompt at the wrong moment converts a good race into a one-star
 * review, which is worse than never asking.
 */
export interface ReviewMoment {
  /** Championship position, 1-based. */
  championshipPosition: number
  /** Whether this install has already been asked. */
  alreadyAsked: boolean
}

export function shouldAskForReview(m: ReviewMoment): boolean {
  if (m.alreadyAsked) return false
  return m.championshipPosition === 1
}
