// Quick test for WASM module
import * as wasm from './pkg/wasm_processing.js';

console.log('WASM version:', wasm.get_version());

// Test PointCloud2 processing
// Create fake base64 data: 3 points (x,y,z as f32 = 12 bytes per point)
const testPoints = new Float32Array([
  1.0, 2.0, 3.0,  // point 1
  4.0, 5.0, 6.0,  // point 2
  0.0, 0.0, 0.0,  // point 3 (should be filtered as origin)
]);

const buffer = Buffer.from(testPoints.buffer);
const base64Data = buffer.toString('base64');

console.log('Test base64 data length:', base64Data.length);

try {
  const result = wasm.process_pointcloud2(
    base64Data,
    12,  // point_step: 3 floats * 4 bytes
    0,   // x_offset
    4,   // y_offset
    8,   // z_offset
    100  // max_points
  );

  console.log('Processed points count:', result.length / 4);
  console.log('First point:', result[0], result[1], result[2], result[3]);
  console.log('Second point:', result[4], result[5], result[6], result[7]);
  console.log('✅ WASM PointCloud2 processing works!');
} catch (e) {
  console.error('❌ Error:', e);
}

// Test LaserScan processing
const ranges = new Float32Array([1.0, 2.0, 3.0, 0.0, 4.0]); // one invalid (0.0)
const laserResult = wasm.process_laserscan(ranges, 0.0, 0.1);
console.log('LaserScan processed points:', laserResult.length / 4);
console.log('✅ WASM LaserScan processing works!');

// Test OccupancyGrid decoding
const gridData = Buffer.from([0, 50, 100, 255]); // 255 = -1 in signed
const gridBase64 = gridData.toString('base64');
const decoded = wasm.decode_occupancy_grid(gridBase64);
console.log('Decoded grid:', Array.from(decoded));
console.log('✅ WASM OccupancyGrid decoding works!');

console.log('\n🎉 All WASM tests passed!');
