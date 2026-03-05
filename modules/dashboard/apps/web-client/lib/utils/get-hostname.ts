/**
 * Returns the hostname of the current browser location.
 *
 * NOTE: On the server (SSR/tests), we fall back to `localhost`.
 */
export function getHostname(): string {
  if (typeof window === 'undefined') return 'localhost'
  return window.location.hostname
}
