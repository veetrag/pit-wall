import { Component, type ReactNode } from 'react'
import { useSeasonStore } from '@state/seasonStore'

// Before this existed, the only boundary in the app was CanvasBoundary around
// <TrackCanvas>. Anything thrown outside that subtree — the timing tower, the
// pit panel, engine.step() called from raceStore — unmounted the whole React
// tree and left a black screen with no way back to the menu.
//
// Recovery is offered in two tiers because they fail differently:
//   RETURN TO MENU  — keeps the process alive; enough when the fault was in a
//                     race-only component. The in-progress race is lost either
//                     way (race state is memory-only), so this does not pretend
//                     to resume it.
//   RELOAD          — for when the menu itself is what threw, in which case
//                     resetting the phase would just throw again on re-render.

type Props = { children: ReactNode }
type State = { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: unknown, info: unknown) {
    // Goes to logcat on device, where it is the only trace we get of a
    // production crash — there is no remote error reporting in v1.
    console.error('[AppErrorBoundary]', error, info)
  }

  private returnToMenu = () => {
    // Reset the phase first, then clear the error, so the tree remounts
    // straight onto the menu rather than re-rendering whatever threw.
    useSeasonStore.getState().backToMenu()
    this.setState({ error: null })
  }

  private reload = () => {
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 14,
          padding: '24px', textAlign: 'center',
          background: 'var(--bg-deep)',
          paddingTop: 'calc(24px + var(--safe-top))',
          paddingBottom: 'calc(24px + var(--safe-bottom))',
        }}
      >
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em',
          color: 'var(--accent-warm)',
        }}>
          RED FLAG
        </div>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700,
          color: 'var(--text-hi)',
        }}>
          Something broke
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-mid)',
          lineHeight: 1.5, maxWidth: 320,
        }}>
          The app hit an unexpected error. Any race in progress has been lost, but
          your championship standings are safe.
        </div>

        {/* The message is the only diagnostic a player can report back, so it is
            shown rather than swallowed — truncated to stay readable. */}
        <pre style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
          background: 'var(--bg-panel)', border: '1px solid var(--line-hair)',
          borderRadius: 8, padding: '10px 12px', maxWidth: '100%',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          textAlign: 'left', margin: 0,
        }}>
          {error.message.slice(0, 300)}
        </pre>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={this.returnToMenu}
            style={{
              background: 'var(--accent)', color: 'var(--bg-deep)', border: 'none',
              borderRadius: 10, padding: '14px 22px', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.08em',
            }}
          >
            RETURN TO MENU
          </button>
          <button
            onClick={this.reload}
            style={{
              background: 'transparent', color: 'var(--text-mid)',
              border: '1px solid var(--line-hair)',
              borderRadius: 10, padding: '14px 22px', cursor: 'pointer',
              fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600,
              letterSpacing: '0.08em',
            }}
          >
            RELOAD
          </button>
        </div>
      </div>
    )
  }
}
