import { pickFurther, serialiseCloud, type CloudSnapshot } from './cloudSave'
import type { Reconciliation } from './types'

/**
 * The sync decision at sign-in, as a pure function.
 *
 * Everything hard about cloud save is in here; the plugin wrapper that calls
 * it is plumbing. Keeping the decision separate from the transport is what
 * makes it possible to assert -- on a laptop, in milliseconds -- that the case
 * which destroys a career cannot happen.
 */
export function reconcile(
  local: CloudSnapshot | null,
  remote: CloudSnapshot | null,
): Reconciliation {
  if (!local && !remote) return { action: 'none' }
  if (local && !remote) return { action: 'upload', snapshot: local }
  if (!local && remote) return { action: 'download', snapshot: remote }

  // Both exist. Identical content is the common case on a single device that
  // simply reopened the app: say so, rather than churning a pointless write
  // on every launch.
  const a = local as CloudSnapshot
  const b = remote as CloudSnapshot
  if (serialiseCloud(a) === serialiseCloud(b)) return { action: 'none' }

  const winner = pickFurther(a, b)
  // Deliberately compared by identity, not by value: pickFurther returns one
  // of the two objects it was given, so this asks "which side won" without
  // re-deriving the comparison and risking a different answer.
  return winner === a
    ? { action: 'upload', snapshot: a }
    : { action: 'download', snapshot: b }
}
