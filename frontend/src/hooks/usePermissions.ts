/**
 * Permission checks for the current user (docs/hr.md §28).
 *
 * The backend returns the caller's effective permission set on login and on
 * GET /users/me. Wildcards are preserved as sent — '*' or '<resource>.*' — so a
 * new permission added server-side is honoured here without a frontend release.
 *
 * PRESENTATION ONLY. Hiding a control does not protect anything; the server
 * re-checks every request and omits sensitive fields from the payload entirely.
 */

import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '../store'
import type { Permission } from '../constants/permissions'

/** Pure check — usable outside React (e.g. Sidebar's nav filter). */
export function hasPermission(
  granted: string[] | undefined,
  permission: Permission | string,
): boolean {
  if (!granted?.length) return false
  if (granted.includes('*') || granted.includes(permission)) return true
  const resource = permission.split('.')[0]
  return granted.includes(`${resource}.*`)
}

export function usePermissions() {
  const permissions = useSelector((s: RootState) => s.auth.user?.permissions)

  // Memoized on the permissions array, which is a stable reference from the
  // store. Returning fresh closures on every render makes `can` unusable in a
  // useEffect dependency array: the effect re-fires each render, and with
  // takeLatest cancelling the previous request it becomes an infinite fetch
  // loop that never resolves. Callers should be able to depend on these.
  return useMemo(() => {
    const can = (permission: Permission | string) => hasPermission(permissions, permission)
    return {
      can,
      /** At least one — for nav entries covering several routes. */
      canAny: (...list: (Permission | string)[]) => list.some(can),
      /** All of them — for compound actions. */
      canAll: (...list: (Permission | string)[]) => list.every(can),
      permissions: permissions ?? [],
    }
  }, [permissions])
}
