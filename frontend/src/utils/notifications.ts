/**
 * Browser notification helpers.
 *
 * Preference keys stored in localStorage:
 *   notif_browser  — 'granted' | 'denied' | 'default' (mirrors Notification.permission)
 *   notif_inapp    — 'true' | 'false'
 *   notif_prompted — 'true'  (set once after the first-login prompt so we don't ask again)
 */

export const PREF_BROWSER  = 'notif_browser'
export const PREF_INAPP    = 'notif_inapp'
export const PREF_PROMPTED = 'notif_prompted'

/** Whether we have already asked the user this session / ever. */
export function hasBeenPrompted(): boolean {
  return localStorage.getItem(PREF_PROMPTED) === 'true'
}

export function markPrompted(): void {
  localStorage.setItem(PREF_PROMPTED, 'true')
}

/** Current browser-notification preference (what the user chose in-app). */
export function getBrowserPref(): NotificationPermission {
  return (localStorage.getItem(PREF_BROWSER) as NotificationPermission) || 'default'
}

/** Whether in-app notifications are enabled (default: true). */
export function getInAppPref(): boolean {
  const v = localStorage.getItem(PREF_INAPP)
  return v === null ? true : v === 'true'
}

export function setInAppPref(enabled: boolean): void {
  localStorage.setItem(PREF_INAPP, String(enabled))
}

/**
 * Request browser notification permission.
 * Stores the result in localStorage so the Settings UI can read it without
 * triggering a real permission request on every render.
 * Returns the resulting permission string.
 */
export async function requestBrowserPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission === 'granted') {
    localStorage.setItem(PREF_BROWSER, 'granted')
    return 'granted'
  }
  const result = await Notification.requestPermission()
  localStorage.setItem(PREF_BROWSER, result)
  return result
}

/**
 * Show a browser notification — only if permission is granted AND
 * the in-app toggle hasn't overridden it.
 */
export function showBrowserNotification(title: string, body: string, icon?: string): void {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!getInAppPref()) return
  new Notification(title, { body, icon: icon || '/logo192.png' })
}
