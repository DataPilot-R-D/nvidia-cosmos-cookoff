/**
 * Frontier Detection Algorithm
 *
 * Detects frontiers (boundaries between known/free and unknown areas)
 * on an OccupancyGrid map for autonomous exploration.
 *
 * @see Plan: Automatyczne Skanowanie Przestrzeni
 */

// =============================================================================
// Types
// =============================================================================

/**
 * A frontier point on the map
 */
export interface Frontier {
  /** World X coordinate (meters) */
  x: number
  /** World Y coordinate (meters) */
  y: number
  /** Score based on number of unknown neighbors (higher = more to explore) */
  score: number
  /** Grid cell X index */
  cellX: number
  /** Grid cell Y index */
  cellY: number
}

/**
 * Map metadata for frontier detection
 */
export interface MapMetadata {
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
}

// =============================================================================
// Constants
// =============================================================================

/** Occupancy grid values */
const UNKNOWN = -1
const FREE_THRESHOLD = 50 // Values 0-50 are considered free
// Note: OCCUPIED_THRESHOLD can be used for obstacle detection in future
// const OCCUPIED_THRESHOLD = 65 // Values 65+ are considered occupied

/** Minimum cluster size to be considered a valid frontier */
const MIN_CLUSTER_SIZE = 3

/** Default cluster radius in meters */
const DEFAULT_CLUSTER_RADIUS = 0.5

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if a cell value represents free space
 */
function isFree(value: number): boolean {
  return value >= 0 && value <= FREE_THRESHOLD
}

/**
 * Check if a cell value represents unknown space
 */
function isUnknown(value: number): boolean {
  return value === UNKNOWN
}

/**
 * Get cell value safely (returns UNKNOWN for out of bounds)
 */
function getCellValue(
  gridData: Int8Array,
  x: number,
  y: number,
  width: number,
  height: number
): number {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return UNKNOWN
  }
  return gridData[y * width + x]
}

/**
 * Convert grid cell to world coordinates
 */
function cellToWorld(
  cellX: number,
  cellY: number,
  resolution: number,
  originX: number,
  originY: number
): { x: number; y: number } {
  return {
    x: originX + (cellX + 0.5) * resolution,
    y: originY + (cellY + 0.5) * resolution,
  }
}

/**
 * Calculate distance between two points
 */
function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

// =============================================================================
// Main Functions
// =============================================================================

/**
 * Detect all frontier cells on the map
 *
 * A frontier is a free cell that has at least one unknown neighbor.
 *
 * @param gridData - Int8Array of occupancy values (-1 to 100)
 * @param metadata - Map metadata (width, height, resolution, origin)
 * @returns Array of frontier points with world coordinates and scores
 */
export function detectFrontiers(gridData: Int8Array, metadata: MapMetadata): Frontier[] {
  const { width, height, resolution, originX, originY } = metadata
  const frontiers: Frontier[] = []

  // 4-connected neighbors (up, down, left, right)
  const neighbors = [
    [0, -1], // up
    [0, 1], // down
    [-1, 0], // left
    [1, 0], // right
  ]

  // 8-connected neighbors for scoring
  const neighbors8 = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]

  // Iterate over all cells
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const cellValue = gridData[y * width + x]

      // Skip if not free
      if (!isFree(cellValue)) continue

      // Check if any 4-connected neighbor is unknown
      let hasUnknownNeighbor = false
      for (const [dx, dy] of neighbors) {
        const neighborValue = getCellValue(gridData, x + dx, y + dy, width, height)
        if (isUnknown(neighborValue)) {
          hasUnknownNeighbor = true
          break
        }
      }

      if (!hasUnknownNeighbor) continue

      // Calculate score based on 8-connected unknown neighbors
      let score = 0
      for (const [dx, dy] of neighbors8) {
        const neighborValue = getCellValue(gridData, x + dx, y + dy, width, height)
        if (isUnknown(neighborValue)) {
          score++
        }
      }

      // Convert to world coordinates
      const worldPos = cellToWorld(x, y, resolution, originX, originY)

      frontiers.push({
        x: worldPos.x,
        y: worldPos.y,
        score,
        cellX: x,
        cellY: y,
      })
    }
  }

  return frontiers
}

/**
 * Cluster nearby frontiers to reduce the number of exploration targets
 *
 * Uses a simple greedy clustering approach: iterate through frontiers,
 * if a frontier is close to an existing cluster center, merge it.
 *
 * @param frontiers - Array of frontier points
 * @param clusterRadius - Maximum distance to merge into a cluster (meters)
 * @returns Array of cluster centers with aggregated scores
 */
export function clusterFrontiers(
  frontiers: Frontier[],
  clusterRadius: number = DEFAULT_CLUSTER_RADIUS
): Frontier[] {
  if (frontiers.length === 0) return []

  // Sort by score (descending) to prioritize high-value frontiers
  const sorted = [...frontiers].sort((a, b) => b.score - a.score)

  const clusters: Frontier[] = []
  const used = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (used.has(i)) continue

    const cluster = sorted[i]
    let totalX = cluster.x
    let totalY = cluster.y
    let totalScore = cluster.score
    let count = 1

    // Find all frontiers within radius
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(j)) continue

      const other = sorted[j]
      const dist = distance(cluster.x, cluster.y, other.x, other.y)

      if (dist <= clusterRadius) {
        totalX += other.x
        totalY += other.y
        totalScore += other.score
        count++
        used.add(j)
      }
    }

    used.add(i)

    // Only keep clusters with minimum size
    if (count >= MIN_CLUSTER_SIZE) {
      clusters.push({
        x: totalX / count,
        y: totalY / count,
        score: totalScore,
        cellX: Math.round(cluster.cellX),
        cellY: Math.round(cluster.cellY),
      })
    }
  }

  return clusters.sort((a, b) => b.score - a.score)
}

/**
 * Select the best frontier to explore next
 *
 * Balances between score (exploration value) and distance from robot.
 * Uses a weighted cost function: cost = distance - (score * scoreWeight)
 *
 * @param frontiers - Clustered frontier points
 * @param robotX - Robot's current X position (world coordinates)
 * @param robotY - Robot's current Y position (world coordinates)
 * @param scoreWeight - Weight for score vs distance (default: 0.5)
 * @returns Best frontier to explore, or null if none available
 */
export function selectBestFrontier(
  frontiers: Frontier[],
  robotX: number,
  robotY: number,
  scoreWeight: number = 0.5
): Frontier | null {
  if (frontiers.length === 0) return null

  let bestFrontier: Frontier | null = null
  let bestCost = Infinity

  for (const frontier of frontiers) {
    const dist = distance(robotX, robotY, frontier.x, frontier.y)

    // Skip frontiers that are too close (likely already explored)
    if (dist < 0.5) continue

    // Skip frontiers that are too far (exploration efficiency)
    if (dist > 10) continue

    // Cost function: prefer close frontiers with high scores
    const cost = dist - frontier.score * scoreWeight

    if (cost < bestCost) {
      bestCost = cost
      bestFrontier = frontier
    }
  }

  return bestFrontier
}

/**
 * Calculate the percentage of the map that has been explored
 *
 * @param gridData - Int8Array of occupancy values
 * @returns Percentage of explored area (0-100)
 */
export function calculateExploredPercentage(gridData: Int8Array): number {
  let totalCells = 0
  let knownCells = 0

  for (let i = 0; i < gridData.length; i++) {
    totalCells++
    if (gridData[i] !== UNKNOWN) {
      knownCells++
    }
  }

  return totalCells > 0 ? (knownCells / totalCells) * 100 : 0
}

/**
 * Process OccupancyGrid data and return exploration targets
 *
 * Convenience function that combines detection, clustering, and selection.
 *
 * @param gridData - Int8Array of occupancy values
 * @param metadata - Map metadata
 * @param robotX - Robot's current X position
 * @param robotY - Robot's current Y position
 * @param maxTargets - Maximum number of targets to return
 * @returns Object with frontiers, best target, and explored percentage
 */
export function analyzeMapForExploration(
  gridData: Int8Array,
  metadata: MapMetadata,
  robotX: number,
  robotY: number,
  maxTargets: number = 10
): {
  frontiers: Frontier[]
  bestTarget: Frontier | null
  exploredPercent: number
} {
  // Detect all frontiers
  const rawFrontiers = detectFrontiers(gridData, metadata)

  // Cluster frontiers
  const clusteredFrontiers = clusterFrontiers(rawFrontiers)

  // Select best target
  const bestTarget = selectBestFrontier(clusteredFrontiers, robotX, robotY)

  // Calculate explored percentage
  const exploredPercent = calculateExploredPercentage(gridData)

  return {
    frontiers: clusteredFrontiers.slice(0, maxTargets),
    bestTarget,
    exploredPercent,
  }
}
