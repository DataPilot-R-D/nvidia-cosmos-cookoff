import { useState, useEffect } from 'react'

/**
 * React hook that tracks a CSS media query.
 * Returns true when the query matches.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mql = window.matchMedia(query)
    setMatches(mql.matches)

    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}

/** Convenience: true when viewport < 768px */
export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 767px)')
}
