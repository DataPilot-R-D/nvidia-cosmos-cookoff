/**
 * Buffer Pool for Video Frame Processing
 *
 * Pre-allocates buffers to avoid per-frame allocation overhead.
 * Reduces GC pressure for high-frequency video streaming (~15 FPS).
 *
 * Usage:
 * ```typescript
 * const buffer = frameBufferPool.acquire()
 * if (buffer) {
 *   // Use buffer for processing
 *   frameBufferPool.release(buffer)
 * }
 * ```
 */

import type { Logger } from 'pino'

export class BufferPool {
  private readonly pool: Buffer[] = []
  private readonly inUse: Set<Buffer> = new Set()
  private logger?: Logger

  constructor(
    private readonly poolSize: number = 10,
    bufferSize: number = 5 * 1024 * 1024 // 5MB default
  ) {
    // Pre-allocate buffers at startup
    for (let i = 0; i < poolSize; i++) {
      this.pool.push(Buffer.allocUnsafe(bufferSize))
    }
  }

  /**
   * Set logger for pool exhaustion warnings
   */
  setLogger(logger: Logger): void {
    this.logger = logger
  }

  /**
   * Acquire a buffer from the pool
   * Returns null if pool is exhausted (caller should handle gracefully)
   */
  acquire(): Buffer | null {
    const buffer = this.pool.pop()
    if (buffer) {
      this.inUse.add(buffer)
      return buffer
    }
    this.logger?.warn(
      { poolSize: this.poolSize, inUse: this.inUse.size },
      'Buffer pool exhausted - consider increasing pool size'
    )
    return null
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: Buffer): void {
    if (this.inUse.has(buffer)) {
      this.inUse.delete(buffer)
      this.pool.push(buffer)
    }
  }

  /**
   * Get pool statistics for monitoring
   */
  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.pool.length,
      inUse: this.inUse.size,
      total: this.poolSize,
    }
  }

  /**
   * Cleanup - release all buffers
   */
  dispose(): void {
    this.pool.length = 0
    this.inUse.clear()
  }
}

// Singleton instance for video frame processing
// 10 buffers x 5MB = 50MB pre-allocated memory
export const frameBufferPool = new BufferPool(10, 5 * 1024 * 1024)
