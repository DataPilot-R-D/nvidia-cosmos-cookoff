/* tslint:disable */
/* eslint-disable */

/**
 * Decode base64 OccupancyGrid data to Uint8Array
 *
 * Converts signed int8 (-1 = unknown, 0-100 = probability) to unsigned
 * for efficient canvas rendering.
 *
 * # Arguments
 * * `base64_data` - Base64 encoded grid data
 *
 * # Returns
 * Uint8Array where -1 becomes 255 (unknown), 0-100 stay as-is
 */
export function decode_occupancy_grid(base64_data: string): Uint8Array

/**
 * Find frontier cells in an occupancy grid
 *
 * Frontiers are free cells adjacent to unknown cells.
 * Used for exploration planning.
 *
 * # Arguments
 * * `grid_data` - Uint8Array of grid cells (0=free, 100=occupied, 255=unknown)
 * * `width` - Grid width
 * * `height` - Grid height
 *
 * # Returns
 * Uint8Array where 1 = frontier cell, 0 = not frontier
 */
export function find_frontiers(grid_data: Uint8Array, width: number, height: number): Uint8Array

/**
 * Get WASM module version
 */
export function get_version(): string

/**
 * Process LaserScan: convert polar coordinates to Cartesian
 *
 * # Arguments
 * * `ranges` - Float32Array of distance measurements
 * * `angle_min` - Start angle in radians
 * * `angle_increment` - Angle step between measurements
 *
 * # Returns
 * Float32Array with [x,y,z,intensity] tuples flattened (z=0 for 2D scan)
 */
export function process_laserscan(
  ranges: Float32Array,
  angle_min: number,
  angle_increment: number
): Float32Array

/**
 * Process PointCloud2 binary data
 *
 * This is the main workhorse function that:
 * 1. Decodes base64 data
 * 2. Parses binary buffer according to ROS PointCloud2 format
 * 3. Applies decimation (skip factor)
 * 4. Filters NaN/Infinity and origin points
 * 5. Returns flat Float32Array [x1,y1,z1,i1, x2,y2,z2,i2, ...]
 *
 * # Arguments
 * * `base64_data` - Base64 encoded binary point cloud data
 * * `point_step` - Bytes per point (typically 12-32)
 * * `x_offset` - Byte offset to X field
 * * `y_offset` - Byte offset to Y field
 * * `z_offset` - Byte offset to Z field
 * * `max_points` - Maximum points to return (decimation applied if exceeded)
 *
 * # Returns
 * Float32Array with [x,y,z,intensity] tuples flattened
 */
export function process_pointcloud2(
  base64_data: string,
  point_step: number,
  x_offset: number,
  y_offset: number,
  z_offset: number,
  max_points: number
): Float32Array
