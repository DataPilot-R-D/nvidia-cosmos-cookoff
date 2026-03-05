/**
 * Map Storage
 *
 * SQLite-based storage for OccupancyGrid maps.
 * Uses Bun's native SQLite implementation (bun:sqlite).
 * Supports saving, loading, and managing exploration maps.
 *
 * @see Plan: Automatyczne Skanowanie Przestrzeni
 */

import { Database } from 'bun:sqlite'
import { randomUUID } from 'crypto'
import { join } from 'path'
import { mkdirSync, existsSync, writeFileSync, unlinkSync } from 'fs'
import sharp from 'sharp'

// =============================================================================
// Types
// =============================================================================

/**
 * Map metadata (without data blob)
 */
export interface MapMetadata {
  id: string
  name: string
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  createdAt: number
  robotId: string | null
  exploredPercent: number | null
  /** Base64 encoded PNG thumbnail (200x200) */
  thumbnail: string | null
}

/**
 * Full map data including grid
 */
export interface MapData extends MapMetadata {
  /** Base64 encoded Int8Array of occupancy values */
  data: string
  /** Frame ID (e.g., 'map') */
  frameId: string
}

/**
 * Input for saving a map
 */
export interface SaveMapInput {
  name: string
  width: number
  height: number
  resolution: number
  originX: number
  originY: number
  frameId: string
  data: string
  robotId?: string
  exploredPercent?: number
}

// =============================================================================
// Database Setup
// =============================================================================

const DATA_DIR = join(process.cwd(), 'data')
const DB_PATH = join(DATA_DIR, 'maps.db')
const MAPS_DIR = join(DATA_DIR, 'maps')

// Ensure directories exist
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}
if (!existsSync(MAPS_DIR)) {
  mkdirSync(MAPS_DIR, { recursive: true })
}

// Initialize database using Bun's native SQLite
const db = new Database(DB_PATH)

// Enable WAL mode for better performance
db.run('PRAGMA journal_mode = WAL')

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS maps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    resolution REAL NOT NULL,
    origin_x REAL NOT NULL,
    origin_y REAL NOT NULL,
    frame_id TEXT NOT NULL DEFAULT 'map',
    data TEXT NOT NULL,
    robot_id TEXT,
    explored_percent REAL,
    created_at INTEGER NOT NULL,
    thumbnail TEXT
  )
`)

// Migration: Add thumbnail column if it doesn't exist
try {
  db.run('ALTER TABLE maps ADD COLUMN thumbnail TEXT')
} catch {
  // Column already exists - ignore error
}

db.run(`CREATE INDEX IF NOT EXISTS idx_maps_created_at ON maps(created_at DESC)`)
db.run(`CREATE INDEX IF NOT EXISTS idx_maps_robot_id ON maps(robot_id)`)

// =============================================================================
// Prepared Statements (Bun SQLite)
// =============================================================================

const insertMapStmt = db.prepare(`
  INSERT INTO maps (id, name, width, height, resolution, origin_x, origin_y, frame_id, data, robot_id, explored_percent, created_at, thumbnail)
  VALUES ($id, $name, $width, $height, $resolution, $originX, $originY, $frameId, $data, $robotId, $exploredPercent, $createdAt, $thumbnail)
`)

const selectMapByIdStmt = db.prepare(`
  SELECT id, name, width, height, resolution, origin_x as originX, origin_y as originY,
         frame_id as frameId, data, robot_id as robotId, explored_percent as exploredPercent, created_at as createdAt
  FROM maps WHERE id = $id
`)

const selectAllMapsStmt = db.prepare(`
  SELECT id, name, width, height, resolution, origin_x as originX, origin_y as originY,
         robot_id as robotId, explored_percent as exploredPercent, created_at as createdAt, thumbnail
  FROM maps ORDER BY created_at DESC
`)

const selectMapsByRobotStmt = db.prepare(`
  SELECT id, name, width, height, resolution, origin_x as originX, origin_y as originY,
         robot_id as robotId, explored_percent as exploredPercent, created_at as createdAt, thumbnail
  FROM maps WHERE robot_id = $robotId ORDER BY created_at DESC
`)

const deleteMapStmt = db.prepare(`DELETE FROM maps WHERE id = $id`)

const updateMapNameStmt = db.prepare(`UPDATE maps SET name = $name WHERE id = $id`)

// =============================================================================
// Thumbnail Generation
// =============================================================================

const THUMBNAIL_SIZE = 200

/**
 * Generate PNG thumbnail from OccupancyGrid data
 *
 * Converts occupancy values to grayscale pixels and resizes to 200x200
 */
async function generateThumbnail(
  data: string,
  width: number,
  height: number
): Promise<string | null> {
  try {
    // Decode base64 to Int8Array
    const gridBuffer = Buffer.from(data, 'base64')
    const gridData = new Int8Array(gridBuffer.buffer, gridBuffer.byteOffset, gridBuffer.length)

    // Create RGBA pixel data (grayscale with alpha)
    const pixels = Buffer.alloc(width * height * 4)

    for (let i = 0; i < gridData.length; i++) {
      const value = gridData[i]
      let gray: number

      if (value === -1) {
        // Unknown -> dark gray
        gray = 50
      } else if (value >= 0 && value <= 100) {
        // Occupancy percentage -> grayscale
        // 0% occupied = 200 (light gray/free)
        // 100% occupied = 0 (black/occupied)
        gray = Math.round(200 * (1 - value / 100))
      } else {
        // Invalid -> dark gray
        gray = 50
      }

      const offset = i * 4
      pixels[offset] = gray // R
      pixels[offset + 1] = gray // G
      pixels[offset + 2] = gray // B
      pixels[offset + 3] = 255 // A
    }

    // Use sharp to create resized PNG
    const pngBuffer = await sharp(pixels, {
      raw: {
        width,
        height,
        channels: 4,
      },
    })
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'contain',
        background: { r: 30, g: 30, b: 30, alpha: 1 },
      })
      .png()
      .toBuffer()

    return pngBuffer.toString('base64')
  } catch (error) {
    // Return null on error - thumbnail is optional
    return null
  }
}

// =============================================================================
// Storage Functions
// =============================================================================

/**
 * Save a new map to the database
 */
export async function saveMap(input: SaveMapInput): Promise<MapMetadata> {
  const id = randomUUID()
  const createdAt = Date.now()

  // Generate thumbnail asynchronously
  const thumbnail = await generateThumbnail(input.data, input.width, input.height)

  insertMapStmt.run({
    $id: id,
    $name: input.name,
    $width: input.width,
    $height: input.height,
    $resolution: input.resolution,
    $originX: input.originX,
    $originY: input.originY,
    $frameId: input.frameId,
    $data: input.data,
    $robotId: input.robotId ?? null,
    $exploredPercent: input.exploredPercent ?? null,
    $createdAt: createdAt,
    $thumbnail: thumbnail,
  })

  // Also export to filesystem immediately (for Nav2 compatibility)
  const mapData: MapData = {
    id,
    name: input.name,
    width: input.width,
    height: input.height,
    resolution: input.resolution,
    originX: input.originX,
    originY: input.originY,
    frameId: input.frameId,
    data: input.data,
    createdAt,
    robotId: input.robotId ?? null,
    exploredPercent: input.exploredPercent ?? null,
    thumbnail,
  }

  // Write PGM and YAML files to disk
  try {
    const pgmPath = join(MAPS_DIR, `${id}.pgm`)
    const yamlPath = join(MAPS_DIR, `${id}.yaml`)

    const pgmBuffer = convertToPgm(mapData)
    writeFileSync(pgmPath, pgmBuffer)

    const yaml = generateYaml(mapData, pgmPath)
    writeFileSync(yamlPath, yaml)

    // map files exported: pgmPath, yamlPath
  } catch (exportError) {
    console.error('[map-storage] Failed to export map files:', exportError)
    // Don't fail the save - DB entry is still valid
  }

  return {
    id,
    name: input.name,
    width: input.width,
    height: input.height,
    resolution: input.resolution,
    originX: input.originX,
    originY: input.originY,
    createdAt,
    robotId: input.robotId ?? null,
    exploredPercent: input.exploredPercent ?? null,
    thumbnail,
  }
}

/**
 * Load a map by ID (with full data)
 */
export function loadMap(mapId: string): MapData | null {
  const row = selectMapByIdStmt.get({ $id: mapId }) as MapData | null
  return row
}

/**
 * List all saved maps (metadata only)
 */
export function listMaps(robotId?: string): MapMetadata[] {
  if (robotId) {
    return selectMapsByRobotStmt.all({ $robotId: robotId }) as MapMetadata[]
  }
  return selectAllMapsStmt.all() as MapMetadata[]
}

/**
 * Delete a map by ID
 * Also removes exported files from filesystem
 */
export function deleteMap(mapId: string): boolean {
  const result = deleteMapStmt.run({ $id: mapId })

  // Clean up filesystem files if they exist
  const pgmPath = join(MAPS_DIR, `${mapId}.pgm`)
  const yamlPath = join(MAPS_DIR, `${mapId}.yaml`)

  try {
    if (existsSync(pgmPath)) unlinkSync(pgmPath)
    if (existsSync(yamlPath)) unlinkSync(yamlPath)
  } catch {
    // Ignore cleanup errors
  }

  return result.changes > 0
}

/**
 * Update map name
 */
export function updateMapName(mapId: string, name: string): boolean {
  const result = updateMapNameStmt.run({ $name: name, $id: mapId })
  return result.changes > 0
}

/**
 * Get map count
 */
export function getMapCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM maps').get() as { count: number }
  return row.count
}

/**
 * Close database connection (for cleanup)
 */
export function closeDatabase(): void {
  db.close()
}

// =============================================================================
// PGM/YAML Export
// =============================================================================

/**
 * Convert OccupancyGrid to PGM format
 *
 * PGM uses 0 = black (occupied), 255 = white (free), 128 = gray (unknown)
 * OccupancyGrid uses -1 = unknown, 0-100 = occupancy percentage
 */
export function convertToPgm(mapData: MapData): Buffer {
  const { width, height, data } = mapData

  // Decode base64 to Int8Array
  const gridBuffer = Buffer.from(data, 'base64')
  const gridData = new Int8Array(gridBuffer.buffer, gridBuffer.byteOffset, gridBuffer.length)

  // Create PGM header
  const header = `P5\n${width} ${height}\n255\n`
  const headerBuffer = Buffer.from(header, 'ascii')

  // Create pixel data
  const pixels = Buffer.alloc(width * height)

  for (let i = 0; i < gridData.length; i++) {
    const value = gridData[i]

    if (value === -1) {
      // Unknown -> gray
      pixels[i] = 205
    } else if (value >= 0 && value <= 100) {
      // Occupancy percentage -> grayscale
      // 0% occupied = 254 (white/free)
      // 100% occupied = 0 (black/occupied)
      pixels[i] = Math.round(254 * (1 - value / 100))
    } else {
      // Invalid -> gray
      pixels[i] = 205
    }
  }

  return Buffer.concat([headerBuffer, pixels])
}

/**
 * Generate YAML metadata file for map
 */
export function generateYaml(mapData: MapData, pgmFilename: string): string {
  return `image: ${pgmFilename}
resolution: ${mapData.resolution}
origin: [${mapData.originX}, ${mapData.originY}, 0.0]
occupied_thresh: 0.65
free_thresh: 0.196
negate: 0
`
}

// =============================================================================
// Filesystem Export (for Nav2)
// =============================================================================

export interface ExportedMapFiles {
  pgmPath: string
  yamlPath: string
}

/**
 * Export map to filesystem for Nav2 map_server
 *
 * Nav2 requires actual .pgm and .yaml files on disk.
 * Files are written to data/maps/{mapId}.pgm and data/maps/{mapId}.yaml
 */
export function exportMapToFilesystem(mapId: string): ExportedMapFiles | null {
  const mapData = loadMap(mapId)
  if (!mapData) {
    return null
  }

  const pgmPath = join(MAPS_DIR, `${mapId}.pgm`)
  const yamlPath = join(MAPS_DIR, `${mapId}.yaml`)

  // Generate and write PGM file
  const pgmBuffer = convertToPgm(mapData)
  writeFileSync(pgmPath, pgmBuffer)

  // Generate and write YAML file (with absolute path to PGM)
  const yaml = generateYaml(mapData, pgmPath)
  writeFileSync(yamlPath, yaml)

  return { pgmPath, yamlPath }
}

/**
 * Get the maps directory path
 */
export function getMapsDir(): string {
  return MAPS_DIR
}
