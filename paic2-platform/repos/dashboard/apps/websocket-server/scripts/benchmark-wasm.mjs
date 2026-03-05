/**
 * Benchmark: JavaScript vs Rust WASM Performance
 *
 * Compares processing speed for:
 * - PointCloud2 (base64 decode + binary parsing + decimation)
 * - LaserScan (polar to cartesian conversion)
 *
 * Run: node apps/websocket-server/scripts/benchmark-wasm.mjs
 */

import * as wasmProcessing from '@workspace/wasm-processing'

// Generate test data
function generatePointCloud2Data(numPoints) {
  // Create fake PointCloud2: each point has x, y, z as Float32 (12 bytes per point)
  const pointStep = 12
  const buffer = Buffer.alloc(numPoints * pointStep)

  for (let i = 0; i < numPoints; i++) {
    const offset = i * pointStep
    buffer.writeFloatLE(Math.random() * 10 - 5, offset)      // x
    buffer.writeFloatLE(Math.random() * 10 - 5, offset + 4)  // y
    buffer.writeFloatLE(Math.random() * 2, offset + 8)       // z
  }

  return {
    base64: buffer.toString('base64'),
    pointStep,
    xOffset: 0,
    yOffset: 4,
    zOffset: 8,
  }
}

function generateLaserScanData(numRanges) {
  const ranges = new Float32Array(numRanges)
  for (let i = 0; i < numRanges; i++) {
    ranges[i] = Math.random() * 10 + 0.1  // 0.1 to 10.1 meters
  }
  return {
    ranges,
    angleMin: -Math.PI,
    angleIncrement: (2 * Math.PI) / numRanges,
  }
}

// JavaScript implementations (original)
function jsProcessPointCloud2(base64Data, pointStep, xOffset, yOffset, zOffset, maxPoints) {
  const buffer = Buffer.from(base64Data, 'base64')
  const totalPoints = buffer.length / pointStep
  const skipFactor = totalPoints > maxPoints ? Math.ceil(totalPoints / maxPoints) : 1
  const points = []

  for (let i = 0; i < totalPoints && points.length < maxPoints; i += skipFactor) {
    const offset = i * pointStep
    const x = buffer.readFloatLE(offset + xOffset)
    const y = buffer.readFloatLE(offset + yOffset)
    const z = buffer.readFloatLE(offset + zOffset)

    if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue
    if (x === 0 && y === 0 && z === 0) continue

    points.push({ x, y, z, intensity: 1 })
  }

  return points
}

function jsProcessLaserScan(ranges, angleMin, angleIncrement) {
  const points = []
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    if (!isFinite(range) || range <= 0) continue

    const angle = angleMin + i * angleIncrement
    points.push({
      x: range * Math.cos(angle),
      y: range * Math.sin(angle),
      z: 0,
      intensity: 1,
    })
  }
  return points
}

// Benchmark runner
function benchmark(name, fn, iterations = 100) {
  // Warmup
  for (let i = 0; i < 10; i++) fn()

  const times = []
  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    fn()
    times.push(performance.now() - start)
  }

  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const avg = times.reduce((a, b) => a + b, 0) / times.length
  const min = times[0]
  const max = times[times.length - 1]

  return { name, median, avg, min, max, iterations }
}

// Main benchmark
console.log('🚀 WASM vs JavaScript Performance Benchmark\n')
console.log(`WASM version: ${wasmProcessing.get_version()}\n`)
console.log('='.repeat(60))

// PointCloud2 benchmark
const pointCounts = [10000, 50000, 100000]

for (const numPoints of pointCounts) {
  console.log(`\n📊 PointCloud2 (${numPoints.toLocaleString()} points)`)
  console.log('-'.repeat(40))

  const pcData = generatePointCloud2Data(numPoints)
  const maxPoints = 5000

  const jsResult = benchmark('JavaScript', () => {
    return jsProcessPointCloud2(
      pcData.base64,
      pcData.pointStep,
      pcData.xOffset,
      pcData.yOffset,
      pcData.zOffset,
      maxPoints
    )
  }, 50)

  const wasmResult = benchmark('Rust WASM', () => {
    const result = wasmProcessing.process_pointcloud2(
      pcData.base64,
      pcData.pointStep,
      pcData.xOffset,
      pcData.yOffset,
      pcData.zOffset,
      maxPoints
    )
    // Convert to points for fair comparison
    const points = []
    for (let i = 0; i < result.length; i += 4) {
      points.push({ x: result[i], y: result[i+1], z: result[i+2], intensity: result[i+3] })
    }
    return points
  }, 50)

  const speedup = jsResult.median / wasmResult.median

  console.log(`  JavaScript: ${jsResult.median.toFixed(2)}ms (median)`)
  console.log(`  Rust WASM:  ${wasmResult.median.toFixed(2)}ms (median)`)
  console.log(`  🏆 Speedup: ${speedup.toFixed(1)}x`)
}

// LaserScan benchmark
const rangeCounts = [360, 720, 1440]

for (const numRanges of rangeCounts) {
  console.log(`\n📊 LaserScan (${numRanges} ranges)`)
  console.log('-'.repeat(40))

  const lsData = generateLaserScanData(numRanges)

  const jsResult = benchmark('JavaScript', () => {
    return jsProcessLaserScan(
      Array.from(lsData.ranges),
      lsData.angleMin,
      lsData.angleIncrement
    )
  }, 100)

  const wasmResult = benchmark('Rust WASM', () => {
    const result = wasmProcessing.process_laserscan(
      lsData.ranges,
      lsData.angleMin,
      lsData.angleIncrement
    )
    // Convert to points for fair comparison
    const points = []
    for (let i = 0; i < result.length; i += 4) {
      points.push({ x: result[i], y: result[i+1], z: result[i+2], intensity: result[i+3] })
    }
    return points
  }, 100)

  const speedup = jsResult.median / wasmResult.median

  console.log(`  JavaScript: ${jsResult.median.toFixed(3)}ms (median)`)
  console.log(`  Rust WASM:  ${wasmResult.median.toFixed(3)}ms (median)`)
  console.log(`  🏆 Speedup: ${speedup.toFixed(1)}x`)
}

// Frontier Detection benchmark (CPU-bound operation)
const gridSizes = [100, 200, 400]

for (const size of gridSizes) {
  console.log(`\n📊 Frontier Detection (${size}x${size} = ${(size*size).toLocaleString()} cells)`)
  console.log('-'.repeat(40))

  // Create occupancy grid with some free, occupied, and unknown cells
  const gridData = new Uint8Array(size * size)
  for (let i = 0; i < gridData.length; i++) {
    const r = Math.random()
    if (r < 0.3) gridData[i] = 0      // free
    else if (r < 0.5) gridData[i] = 100  // occupied
    else gridData[i] = 255            // unknown
  }

  // JavaScript implementation
  function jsFindFrontiers(grid, width, height) {
    const frontiers = new Uint8Array(width * height)
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        if (grid[idx] > 50) continue
        const neighbors = [
          grid[idx - 1], grid[idx + 1],
          grid[idx - width], grid[idx + width]
        ]
        if (neighbors.some(n => n === 255)) {
          frontiers[idx] = 1
        }
      }
    }
    return frontiers
  }

  const jsResult = benchmark('JavaScript', () => {
    return jsFindFrontiers(gridData, size, size)
  }, 100)

  const wasmResult = benchmark('Rust WASM', () => {
    return wasmProcessing.find_frontiers(gridData, size, size)
  }, 100)

  const speedup = jsResult.median / wasmResult.median

  console.log(`  JavaScript: ${jsResult.median.toFixed(3)}ms (median)`)
  console.log(`  Rust WASM:  ${wasmResult.median.toFixed(3)}ms (median)`)
  console.log(`  🏆 Speedup: ${speedup.toFixed(1)}x`)
}

console.log('\n' + '='.repeat(60))
console.log('✅ Benchmark complete!')
console.log('\n📝 Analysis:')
console.log('  - PointCloud2/LaserScan: V8 JIT highly optimized for these ops')
console.log('  - Frontier detection: Shows true WASM advantage for CPU-bound tasks')
console.log('  - Real gains come from: FlatBuffers (no base64), complex algorithms')
console.log('  - Memory: WASM has lower GC pressure for large datasets')
