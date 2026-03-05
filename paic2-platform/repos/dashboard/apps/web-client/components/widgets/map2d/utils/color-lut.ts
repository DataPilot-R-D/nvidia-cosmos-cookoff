/**
 * Pre-computed Color Lookup Tables for OccupancyGrid rendering
 *
 * Maps grid values (-1 to 100) to RGBA bytes instantly.
 * Using LUTs eliminates runtime color computation in the render loop.
 */

// =============================================================================
// Color Lookup Tables
// =============================================================================

/**
 * Map scheme: unknown=transparent, free=transparent, occupied=white gradient
 * 102 values * 4 bytes (RGBA) = 408 bytes
 */
export const MAP_COLOR_LUT = new Uint8ClampedArray(102 * 4)

/**
 * Costmap scheme: unknown=gray, free=transparent, occupied=green→red gradient
 */
export const COSTMAP_COLOR_LUT = new Uint8ClampedArray(102 * 4)

// =============================================================================
// Initialize MAP_COLOR_LUT
// =============================================================================

for (let v = -1; v <= 100; v++) {
  const offset = (v + 1) * 4

  if (v <= 0) {
    // Unknown (-1) and Free (0): transparent
    MAP_COLOR_LUT[offset] = 0
    MAP_COLOR_LUT[offset + 1] = 0
    MAP_COLOR_LUT[offset + 2] = 0
    MAP_COLOR_LUT[offset + 3] = 0
  } else {
    // Occupied (1-100): white with opacity based on value
    const alpha = Math.min(255, Math.round((v / 100) * 255))
    MAP_COLOR_LUT[offset] = 255
    MAP_COLOR_LUT[offset + 1] = 255
    MAP_COLOR_LUT[offset + 2] = 255
    MAP_COLOR_LUT[offset + 3] = alpha
  }
}

// =============================================================================
// Initialize COSTMAP_COLOR_LUT
// =============================================================================

for (let v = -1; v <= 100; v++) {
  const offset = (v + 1) * 4

  if (v === -1) {
    // Unknown: gray with low opacity
    COSTMAP_COLOR_LUT[offset] = 128
    COSTMAP_COLOR_LUT[offset + 1] = 128
    COSTMAP_COLOR_LUT[offset + 2] = 128
    COSTMAP_COLOR_LUT[offset + 3] = 77 // ~0.3 opacity
  } else if (v === 0) {
    // Free: transparent
    COSTMAP_COLOR_LUT[offset] = 0
    COSTMAP_COLOR_LUT[offset + 1] = 0
    COSTMAP_COLOR_LUT[offset + 2] = 0
    COSTMAP_COLOR_LUT[offset + 3] = 0
  } else {
    // Occupied: green→red gradient (cost visualization)
    const t = v / 100
    COSTMAP_COLOR_LUT[offset] = Math.round(255 * t) // R increases
    COSTMAP_COLOR_LUT[offset + 1] = Math.round(255 * (1 - t)) // G decreases
    COSTMAP_COLOR_LUT[offset + 2] = 0 // B = 0
    COSTMAP_COLOR_LUT[offset + 3] = 153 // ~0.6 opacity
  }
}

// =============================================================================
// Helper Function
// =============================================================================

/**
 * Get the appropriate color LUT for a given scheme
 */
export function getColorLUT(scheme: 'map' | 'costmap'): Uint8ClampedArray {
  return scheme === 'map' ? MAP_COLOR_LUT : COSTMAP_COLOR_LUT
}
