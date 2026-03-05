/**
 * Checkpoint 1: Backend PoC - systeminformation Bun Compatibility Test
 *
 * This script verifies that the systeminformation package works correctly
 * in the Bun runtime without crashing or blocking the event loop.
 *
 * Run: bun run scripts/verify-stats.ts
 */

import si from 'systeminformation'

interface TestResult {
  name: string
  passed: boolean
  details: string
  duration?: number
}

const results: TestResult[] = []

async function runTest(name: string, testFn: () => Promise<string>): Promise<void> {
  const start = performance.now()
  try {
    const details = await testFn()
    const duration = performance.now() - start
    results.push({ name, passed: true, details, duration })
    console.log(`  ✅ ${name}: ${details} (${duration.toFixed(0)}ms)`)
  } catch (error) {
    const duration = performance.now() - start
    const errorMsg = error instanceof Error ? error.message : String(error)
    results.push({ name, passed: false, details: errorMsg, duration })
    console.log(`  ❌ ${name}: ${errorMsg}`)
  }
}

async function main(): Promise<void> {
  console.log('🔍 Testing systeminformation in Bun runtime...\n')
  console.log(`Runtime: Bun ${Bun.version}`)
  console.log(`Platform: ${process.platform} ${process.arch}\n`)

  // Test 1: CPU Information
  console.log('Test 1: CPU Information')
  await runTest('CPU Model', async () => {
    const cpu = await si.cpu()
    return `${cpu.manufacturer} ${cpu.brand} (${cpu.cores} cores)`
  })

  await runTest('CPU Load', async () => {
    const load = await si.currentLoad()
    return `${load.currentLoad.toFixed(1)}% usage`
  })

  // Test 2: Memory Information
  console.log('\nTest 2: Memory Information')
  await runTest('Memory Stats', async () => {
    const mem = await si.mem()
    const usedGB = (mem.used / 1e9).toFixed(2)
    const totalGB = (mem.total / 1e9).toFixed(2)
    const percent = ((mem.used / mem.total) * 100).toFixed(1)
    return `${usedGB}GB / ${totalGB}GB (${percent}%)`
  })

  // Test 3: GPU Information (optional - may not be available)
  console.log('\nTest 3: GPU Information (optional)')
  await runTest('GPU Stats', async () => {
    const graphics = await si.graphics()
    if (graphics.controllers.length === 0) {
      return 'No GPU detected (OK for headless servers)'
    }
    const gpu = graphics.controllers[0]
    return `${gpu.model} (${gpu.vram}MB VRAM)`
  })

  // Test 4: Disk Information
  console.log('\nTest 4: Disk Information')
  await runTest('Disk Stats', async () => {
    const disks = await si.fsSize()
    if (disks.length === 0) {
      return 'No disks detected'
    }
    const disk = disks[0]
    const usedGB = (disk.used / 1e9).toFixed(1)
    const totalGB = (disk.size / 1e9).toFixed(1)
    return `${disk.mount}: ${usedGB}GB / ${totalGB}GB (${disk.use.toFixed(1)}%)`
  })

  // Test 5: Network Information
  console.log('\nTest 5: Network Information')
  await runTest('Network Stats', async () => {
    const net = await si.networkStats()
    if (net.length === 0) {
      return 'No network interfaces'
    }
    const iface = net[0]
    return `${iface.iface}: RX ${(iface.rx_bytes / 1e6).toFixed(1)}MB, TX ${(iface.tx_bytes / 1e6).toFixed(1)}MB`
  })

  // Test 6: Event Loop Blocking Test (CRITICAL)
  console.log('\nTest 6: Event Loop Blocking (CRITICAL)')
  await runTest('Non-blocking concurrent calls', async () => {
    const start = performance.now()

    // Run multiple async operations concurrently with a timer
    // If blocking, the timer will complete much later than 100ms
    const timerPromise = new Promise<number>((resolve) => {
      setTimeout(() => resolve(performance.now() - start), 100)
    })

    const [cpuResult, memResult, timerResult] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      timerPromise,
    ])

    // Timer should complete in ~100ms if not blocked
    // Allow some tolerance (up to 300ms)
    if (timerResult > 300) {
      throw new Error(
        `Event loop blocked! Timer took ${timerResult.toFixed(0)}ms (expected ~100ms)`
      )
    }

    return `Timer: ${timerResult.toFixed(0)}ms, CPU: ${cpuResult.currentLoad.toFixed(1)}%, RAM: ${((memResult.used / memResult.total) * 100).toFixed(1)}%`
  })

  // Test 7: Rapid consecutive calls (stress test)
  console.log('\nTest 7: Rapid Consecutive Calls (Stress Test)')
  await runTest('5 rapid CPU polls', async () => {
    const polls: number[] = []
    for (let i = 0; i < 5; i++) {
      const load = await si.currentLoad()
      polls.push(load.currentLoad)
    }
    const avg = polls.reduce((a, b) => a + b, 0) / polls.length
    return `Avg CPU: ${avg.toFixed(1)}% over 5 polls`
  })

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('SUMMARY')
  console.log('='.repeat(50))

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const critical = results.find((r) => r.name === 'Non-blocking concurrent calls')

  console.log(`\nPassed: ${passed}/${results.length}`)
  console.log(`Failed: ${failed}/${results.length}`)

  if (critical && !critical.passed) {
    console.log('\n🚨 CRITICAL: Event loop blocking detected!')
    console.log('   Recommendation: Use native os module as fallback')
    process.exit(1)
  }

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed, but non-critical')
    console.log('   systeminformation is partially compatible with Bun')

    // Check if critical functions work
    const cpuOk = results.find((r) => r.name === 'CPU Load')?.passed
    const memOk = results.find((r) => r.name === 'Memory Stats')?.passed

    if (cpuOk && memOk) {
      console.log('\n✅ Core functionality (CPU + Memory) works!')
      console.log('   Proceeding with systeminformation is safe.')
      process.exit(0)
    } else {
      console.log('\n❌ Core functionality broken!')
      console.log('   Recommendation: Use native os module as fallback')
      process.exit(1)
    }
  }

  console.log('\n✅ All tests passed!')
  console.log('   systeminformation is fully Bun-compatible.')
  process.exit(0)
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
