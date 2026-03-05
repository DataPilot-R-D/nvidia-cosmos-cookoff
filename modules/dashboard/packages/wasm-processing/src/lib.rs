//! WASM Processing Module for ROS Sensor Data
//!
//! High-performance data processing for:
//! - PointCloud2: base64 decode, binary parsing, decimation, filtering
//! - OccupancyGrid: cell processing, frontier detection
//! - LaserScan: polar to cartesian conversion
//!
//! Expected performance gains: 8-15x faster than JavaScript

use wasm_bindgen::prelude::*;
use js_sys::{Float32Array, Uint8Array};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};

#[cfg(feature = "console_error_panic_hook")]
pub fn set_panic_hook() {
    console_error_panic_hook::set_once();
}

/// Process PointCloud2 binary data
///
/// This is the main workhorse function that:
/// 1. Decodes base64 data
/// 2. Parses binary buffer according to ROS PointCloud2 format
/// 3. Applies decimation (skip factor)
/// 4. Filters NaN/Infinity and origin points
/// 5. Returns flat Float32Array [x1,y1,z1,i1, x2,y2,z2,i2, ...]
///
/// # Arguments
/// * `base64_data` - Base64 encoded binary point cloud data
/// * `point_step` - Bytes per point (typically 12-32)
/// * `x_offset` - Byte offset to X field
/// * `y_offset` - Byte offset to Y field
/// * `z_offset` - Byte offset to Z field
/// * `max_points` - Maximum points to return (decimation applied if exceeded)
///
/// # Returns
/// Float32Array with [x,y,z,intensity] tuples flattened
#[wasm_bindgen]
pub fn process_pointcloud2(
    base64_data: &str,
    point_step: u32,
    x_offset: u32,
    y_offset: u32,
    z_offset: u32,
    max_points: u32,
) -> Result<Float32Array, JsValue> {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();

    // Decode base64
    let buffer = BASE64.decode(base64_data)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode error: {}", e)))?;

    let point_step = point_step as usize;
    let x_offset = x_offset as usize;
    let y_offset = y_offset as usize;
    let z_offset = z_offset as usize;
    let max_points = max_points as usize;

    // Calculate total points and skip factor
    let total_points = buffer.len() / point_step;
    let skip_factor = if total_points > max_points {
        (total_points + max_points - 1) / max_points // ceiling division
    } else {
        1
    };

    // Pre-allocate result buffer (4 floats per point: x, y, z, intensity)
    let estimated_points = (total_points + skip_factor - 1) / skip_factor;
    let mut result: Vec<f32> = Vec::with_capacity(estimated_points * 4);

    // Process points
    let mut point_index = 0;
    while point_index < total_points && result.len() / 4 < max_points {
        let offset = point_index * point_step;

        // Read X, Y, Z as little-endian f32
        let x = read_f32_le(&buffer, offset + x_offset);
        let y = read_f32_le(&buffer, offset + y_offset);
        let z = read_f32_le(&buffer, offset + z_offset);

        // Filter invalid points
        if x.is_finite() && y.is_finite() && z.is_finite() {
            // Skip origin points (0,0,0)
            if !(x == 0.0 && y == 0.0 && z == 0.0) {
                result.push(x);
                result.push(y);
                result.push(z);
                result.push(1.0); // Default intensity
            }
        }

        point_index += skip_factor;
    }

    // Convert to Float32Array
    let array = Float32Array::new_with_length(result.len() as u32);
    array.copy_from(&result);
    Ok(array)
}

/// Read a little-endian f32 from buffer at offset
#[inline]
fn read_f32_le(buffer: &[u8], offset: usize) -> f32 {
    if offset + 4 > buffer.len() {
        return f32::NAN;
    }
    f32::from_le_bytes([
        buffer[offset],
        buffer[offset + 1],
        buffer[offset + 2],
        buffer[offset + 3],
    ])
}

/// Process LaserScan: convert polar coordinates to Cartesian
///
/// # Arguments
/// * `ranges` - Float32Array of distance measurements
/// * `angle_min` - Start angle in radians
/// * `angle_increment` - Angle step between measurements
///
/// # Returns
/// Float32Array with [x,y,z,intensity] tuples flattened (z=0 for 2D scan)
#[wasm_bindgen]
pub fn process_laserscan(
    ranges: &Float32Array,
    angle_min: f32,
    angle_increment: f32,
) -> Float32Array {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();

    let len = ranges.length() as usize;
    let mut result: Vec<f32> = Vec::with_capacity(len * 4);

    for i in 0..len {
        let range = ranges.get_index(i as u32);

        // Skip invalid ranges
        if !range.is_finite() || range <= 0.0 {
            continue;
        }

        let angle = angle_min + (i as f32) * angle_increment;
        let x = range * angle.cos();
        let y = range * angle.sin();

        result.push(x);
        result.push(y);
        result.push(0.0); // z = 0 for 2D scan
        result.push(1.0); // intensity
    }

    let array = Float32Array::new_with_length(result.len() as u32);
    array.copy_from(&result);
    array
}

/// Decode base64 OccupancyGrid data to Uint8Array
///
/// Converts signed int8 (-1 = unknown, 0-100 = probability) to unsigned
/// for efficient canvas rendering.
///
/// # Arguments
/// * `base64_data` - Base64 encoded grid data
///
/// # Returns
/// Uint8Array where -1 becomes 255 (unknown), 0-100 stay as-is
#[wasm_bindgen]
pub fn decode_occupancy_grid(base64_data: &str) -> Result<Uint8Array, JsValue> {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();

    let buffer = BASE64.decode(base64_data)
        .map_err(|e| JsValue::from_str(&format!("Base64 decode error: {}", e)))?;

    // Convert signed to unsigned (ROS uses -1 for unknown)
    let result: Vec<u8> = buffer.iter()
        .map(|&v| {
            let signed = v as i8;
            if signed < 0 { 255u8 } else { v }
        })
        .collect();

    let array = Uint8Array::new_with_length(result.len() as u32);
    array.copy_from(&result);
    Ok(array)
}

/// Find frontier cells in an occupancy grid
///
/// Frontiers are free cells adjacent to unknown cells.
/// Used for exploration planning.
///
/// # Arguments
/// * `grid_data` - Uint8Array of grid cells (0=free, 100=occupied, 255=unknown)
/// * `width` - Grid width
/// * `height` - Grid height
///
/// # Returns
/// Uint8Array where 1 = frontier cell, 0 = not frontier
#[wasm_bindgen]
pub fn find_frontiers(
    grid_data: &Uint8Array,
    width: u32,
    height: u32,
) -> Uint8Array {
    #[cfg(feature = "console_error_panic_hook")]
    set_panic_hook();

    let width = width as usize;
    let height = height as usize;
    let len = grid_data.length() as usize;

    if len != width * height {
        // Return empty array on size mismatch
        return Uint8Array::new_with_length(0);
    }

    // Copy grid to local buffer for faster access
    let mut grid = vec![0u8; len];
    grid_data.copy_to(&mut grid);

    let mut frontiers = vec![0u8; len];

    // Check each cell
    for y in 1..(height - 1) {
        for x in 1..(width - 1) {
            let idx = y * width + x;
            let cell = grid[idx];

            // Only free cells (0-50) can be frontiers
            if cell > 50 {
                continue;
            }

            // Check 4-neighbors for unknown (255)
            let neighbors = [
                grid[idx - 1],         // left
                grid[idx + 1],         // right
                grid[idx - width],     // up
                grid[idx + width],     // down
            ];

            if neighbors.iter().any(|&n| n == 255) {
                frontiers[idx] = 1;
            }
        }
    }

    let array = Uint8Array::new_with_length(len as u32);
    array.copy_from(&frontiers);
    array
}

/// Get WASM module version
#[wasm_bindgen]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_f32_le() {
        // 1.0 in little-endian f32
        let buffer = [0x00, 0x00, 0x80, 0x3f];
        assert_eq!(read_f32_le(&buffer, 0), 1.0);
    }

    #[test]
    fn test_read_f32_le_offset() {
        let buffer = [0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x3f];
        assert_eq!(read_f32_le(&buffer, 3), 1.0);
    }
}
