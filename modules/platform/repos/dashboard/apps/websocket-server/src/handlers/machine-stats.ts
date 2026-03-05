/**
 * Machine Stats Handler
 *
 * Periodically collects system statistics (CPU, Memory, GPU, Disk, Network)
 * and emits them to all connected clients via Socket.IO.
 *
 * Event: 'server:stats' (emitted every 5 seconds by default)
 */

import type { Server as SocketIOServer } from 'socket.io'
import type { Logger } from 'pino'
import si from 'systeminformation'
import type { MachineStatsMessage, MachineStatsData } from '@workspace/shared-types'

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_INTERVAL_MS = 5000 // 5 seconds
const SERVER_ID = process.env.SERVER_ID ?? 'aws-ec2-main'

// =============================================================================
// State
// =============================================================================

let intervalId: ReturnType<typeof setInterval> | null = null
let isCollecting = false

// =============================================================================
// Stats Collection (Non-Blocking)
// =============================================================================

/**
 * Collect system statistics asynchronously without blocking the event loop
 */
async function collectStats(): Promise<MachineStatsData> {
  // Use Promise.all to collect all stats concurrently
  const [cpu, load, mem, graphics, disk, network] = await Promise.all([
    si.cpu().catch(() => null),
    si.currentLoad().catch(() => null),
    si.mem().catch(() => null),
    si.graphics().catch(() => null),
    si.fsSize().catch(() => []),
    si.networkStats().catch(() => []),
  ])

  // Format CPU stats
  const cpuStats = {
    usage: load?.currentLoad ?? 0,
    cores: cpu?.cores ?? 0,
    model: cpu ? `${cpu.manufacturer} ${cpu.brand}` : undefined,
    temperature: undefined as number | undefined, // Would need si.cpuTemperature()
  }

  // Format Memory stats
  const memoryStats = {
    used: mem?.used ?? 0,
    total: mem?.total ?? 1,
    percent: mem ? (mem.used / mem.total) * 100 : 0,
    swap: mem
      ? {
          used: mem.swapused,
          total: mem.swaptotal,
        }
      : undefined,
  }

  // Format GPU stats (optional)
  let gpuStats: MachineStatsData['gpu'] = undefined
  if (graphics && graphics.controllers.length > 0) {
    const gpu = graphics.controllers[0]
    gpuStats = {
      usage: gpu.utilizationGpu ?? 0,
      memoryUsed: (gpu.memoryUsed ?? 0) * 1024 * 1024, // MB to bytes
      memoryTotal: (gpu.vram ?? 0) * 1024 * 1024, // MB to bytes
      temperature: gpu.temperatureGpu ?? undefined,
      name: gpu.model,
    }
  }

  // Format Disk stats (first/root disk)
  let diskStats: MachineStatsData['disk'] = undefined
  if (Array.isArray(disk) && disk.length > 0) {
    const rootDisk = disk.find((d) => d.mount === '/') ?? disk[0]
    diskStats = {
      used: rootDisk.used,
      total: rootDisk.size,
      percent: rootDisk.use,
      mount: rootDisk.mount,
    }
  }

  // Format Network stats (first interface)
  let networkStats: MachineStatsData['network'] = undefined
  if (Array.isArray(network) && network.length > 0) {
    const iface = network[0]
    networkStats = {
      bytesIn: iface.rx_bytes,
      bytesOut: iface.tx_bytes,
      latency: undefined, // Would need ping measurement
    }
  }

  return {
    serverId: SERVER_ID,
    cpu: cpuStats,
    memory: memoryStats,
    gpu: gpuStats,
    disk: diskStats,
    network: networkStats,
  }
}

/**
 * Collect and emit stats to all connected clients
 */
async function collectAndEmit(io: SocketIOServer, logger: Logger): Promise<void> {
  // Prevent overlapping collections
  if (isCollecting) {
    return
  }

  isCollecting = true

  try {
    // Use setImmediate to ensure we don't block the event loop
    const stats = await new Promise<MachineStatsData>((resolve, reject) => {
      setImmediate(async () => {
        try {
          const data = await collectStats()
          resolve(data)
        } catch (error) {
          reject(error)
        }
      })
    })

    const message: MachineStatsMessage = {
      type: 'server:stats',
      timestamp: Date.now(),
      messageId: crypto.randomUUID(),
      data: stats,
    }

    // Emit to all connected clients
    io.emit('server:stats', message)

    logger.debug(
      {
        cpu: `${stats.cpu.usage.toFixed(1)}%`,
        memory: `${stats.memory.percent.toFixed(1)}%`,
        clients: io.engine?.clientsCount ?? 0,
      },
      'Emitted server:stats'
    )
  } catch (error) {
    logger.error({ error }, 'Failed to collect/emit server stats')
  } finally {
    isCollecting = false
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Start emitting server statistics periodically
 *
 * @param io Socket.IO server instance
 * @param logger Pino logger instance
 * @param intervalMs Emission interval in milliseconds (default: 5000)
 */
export function startMachineStatsEmitter(
  io: SocketIOServer,
  logger: Logger,
  intervalMs: number = DEFAULT_INTERVAL_MS
): void {
  if (intervalId) {
    logger.warn('Machine stats emitter already running')
    return
  }

  logger.info({ intervalMs, serverId: SERVER_ID }, 'Starting machine stats emitter')

  // Emit immediately on start
  collectAndEmit(io, logger)

  // Then emit periodically
  intervalId = setInterval(() => {
    collectAndEmit(io, logger)
  }, intervalMs)
}

/**
 * Stop the machine stats emitter
 */
export function stopMachineStatsEmitter(logger: Logger): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
    logger.info('Machine stats emitter stopped')
  }
}

/**
 * Check if the emitter is running
 */
export function isMachineStatsEmitterRunning(): boolean {
  return intervalId !== null
}

/**
 * Manually trigger a stats emission (useful for testing)
 */
export async function emitStatsNow(io: SocketIOServer, logger: Logger): Promise<void> {
  await collectAndEmit(io, logger)
}
