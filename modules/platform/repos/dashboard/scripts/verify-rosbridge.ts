#!/usr/bin/env npx tsx
/**
 * ROSBridge Verification Script
 *
 * Verifies connectivity and topic discovery with ROSBridge.
 * Runs checkpoints to ensure the Topic Inspector feature works correctly.
 *
 * Usage: npx tsx scripts/verify-rosbridge.ts [ws://host:port]
 *
 * Checkpoints:
 * 1. Connection to ROSBridge
 * 2. Topic list is not empty
 * 3. Subscribe to /scan topic and receive data
 */

import WebSocket from 'ws'

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_URL = process.env.ROSBRIDGE_URL ?? 'ws://localhost:9090'
const CONNECTION_TIMEOUT = 10000
const TOPIC_TIMEOUT = 15000
const SCAN_TIMEOUT = 20000
const MAX_RETRIES = 3
const RETRY_DELAY = 2000

// =============================================================================
// Types
// =============================================================================

interface RosbridgeMessage {
  op: string
  topic?: string
  type?: string
  msg?: unknown
  id?: string
  service?: string
  args?: unknown
  result?: unknown
  values?: unknown
}

interface CheckpointResult {
  name: string
  passed: boolean
  message: string
  data?: unknown
}

// =============================================================================
// Helpers
// =============================================================================

function log(level: 'info' | 'success' | 'error' | 'warn', message: string, data?: unknown): void {
  const icons = {
    info: '\x1b[36mℹ\x1b[0m',
    success: '\x1b[32m✓\x1b[0m',
    error: '\x1b[31m✗\x1b[0m',
    warn: '\x1b[33m⚠\x1b[0m',
  }
  const timestamp = new Date().toISOString().slice(11, 23)
  console.log(`${icons[level]} [${timestamp}] ${message}`, data ?? '')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =============================================================================
// ROSBridge Client
// =============================================================================

class RosbridgeClient {
  private ws: WebSocket | null = null
  private url: string
  private messageHandlers: Map<string, (msg: RosbridgeMessage) => void> = new Map()
  private topicHandlers: Map<string, (msg: unknown) => void> = new Map()

  constructor(url: string) {
    this.url = url
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Connection timeout after ${CONNECTION_TIMEOUT}ms`))
      }, CONNECTION_TIMEOUT)

      try {
        this.ws = new WebSocket(this.url)

        this.ws.on('open', () => {
          clearTimeout(timeout)
          log('success', `Connected to ROSBridge at ${this.url}`)
          resolve()
        })

        this.ws.on('error', (error) => {
          clearTimeout(timeout)
          reject(error)
        })

        this.ws.on('message', (data) => {
          try {
            const message: RosbridgeMessage = JSON.parse(data.toString())
            this.handleMessage(message)
          } catch (e) {
            log('warn', 'Failed to parse message', e)
          }
        })

        this.ws.on('close', () => {
          log('info', 'Connection closed')
        })
      } catch (error) {
        clearTimeout(timeout)
        reject(error)
      }
    })
  }

  private handleMessage(message: RosbridgeMessage): void {
    // Handle service responses
    if (message.op === 'service_response' && message.id) {
      const handler = this.messageHandlers.get(message.id)
      if (handler) {
        handler(message)
        this.messageHandlers.delete(message.id)
      }
    }

    // Handle topic messages
    if (message.op === 'publish' && message.topic) {
      const handler = this.topicHandlers.get(message.topic)
      if (handler) {
        handler(message.msg)
      }
    }
  }

  async callService<T>(service: string, args?: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected'))
        return
      }

      const id = `call_${Date.now()}_${Math.random().toString(36).slice(2)}`
      const timeout = setTimeout(() => {
        this.messageHandlers.delete(id)
        reject(new Error(`Service call timeout: ${service}`))
      }, TOPIC_TIMEOUT)

      this.messageHandlers.set(id, (msg) => {
        clearTimeout(timeout)
        resolve(msg.values as T)
      })

      const message: RosbridgeMessage = {
        op: 'call_service',
        service,
        id,
        args,
      }

      this.ws.send(JSON.stringify(message))
    })
  }

  async getTopics(): Promise<{ topics: string[]; types: string[] }> {
    return this.callService('/rosapi/topics')
  }

  subscribe(topic: string, type?: string, callback?: (msg: unknown) => void): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected')
    }

    if (callback) {
      this.topicHandlers.set(topic, callback)
    }

    const message: RosbridgeMessage = {
      op: 'subscribe',
      topic,
      type,
    }

    this.ws.send(JSON.stringify(message))
    log('info', `Subscribed to ${topic}`)
  }

  unsubscribe(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    this.topicHandlers.delete(topic)

    const message: RosbridgeMessage = {
      op: 'unsubscribe',
      topic,
    }

    this.ws.send(JSON.stringify(message))
  }

  async waitForMessage(
    topic: string,
    type?: string,
    timeoutMs: number = SCAN_TIMEOUT
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.topicHandlers.delete(topic)
        reject(new Error(`Timeout waiting for message on ${topic}`))
      }, timeoutMs)

      this.subscribe(topic, type, (msg) => {
        clearTimeout(timeout)
        this.unsubscribe(topic)
        resolve(msg)
      })
    })
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

// =============================================================================
// Checkpoints
// =============================================================================

async function checkpoint1_Connection(url: string): Promise<CheckpointResult> {
  log('info', 'Checkpoint 1: Testing connection to ROSBridge...')

  let lastError: Error | null = null

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const client = new RosbridgeClient(url)
      await client.connect()
      client.disconnect()

      return {
        name: 'Connection',
        passed: true,
        message: `Successfully connected to ${url}`,
      }
    } catch (error) {
      lastError = error as Error
      log('warn', `Attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`)

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY)
      }
    }
  }

  return {
    name: 'Connection',
    passed: false,
    message: `Failed to connect after ${MAX_RETRIES} attempts: ${lastError?.message}`,
  }
}

async function checkpoint2_TopicList(url: string): Promise<CheckpointResult> {
  log('info', 'Checkpoint 2: Fetching topic list...')

  const client = new RosbridgeClient(url)

  try {
    await client.connect()

    const result = await client.getTopics()
    const topics = result.topics || []
    const types = result.types || []

    client.disconnect()

    if (topics.length === 0) {
      return {
        name: 'Topic List',
        passed: false,
        message: 'Topic list is empty - no ROS topics available',
      }
    }

    // Log some interesting topics
    const sensorTopics = topics.filter(
      (t) =>
        t.includes('scan') || t.includes('camera') || t.includes('image') || t.includes('lidar')
    )

    log('info', `Found ${topics.length} topics, ${sensorTopics.length} sensor topics`)

    return {
      name: 'Topic List',
      passed: true,
      message: `Found ${topics.length} ROS topics`,
      data: {
        totalTopics: topics.length,
        sensorTopics: sensorTopics.slice(0, 10),
        sampleTopics: topics.slice(0, 5).map((t, i) => ({
          name: t,
          type: types[i] || 'unknown',
        })),
      },
    }
  } catch (error) {
    client.disconnect()
    return {
      name: 'Topic List',
      passed: false,
      message: `Failed to fetch topics: ${(error as Error).message}`,
    }
  }
}

async function checkpoint3_ScanSubscription(url: string): Promise<CheckpointResult> {
  log('info', 'Checkpoint 3: Testing /scan topic subscription...')

  const client = new RosbridgeClient(url)

  try {
    await client.connect()

    // First get topics to find scan-like topics
    const result = await client.getTopics()
    const topics = result.topics || []

    // Find scan topics
    const scanTopics = topics.filter(
      (t) => t.includes('scan') || t.includes('laser') || t.includes('lidar')
    )

    if (scanTopics.length === 0) {
      client.disconnect()
      return {
        name: 'Scan Subscription',
        passed: false,
        message: 'No scan/laser/lidar topics found in the system',
        data: { availableTopics: topics.slice(0, 20) },
      }
    }

    const targetTopic = scanTopics[0]
    log('info', `Found scan topic: ${targetTopic}`)

    // Try to receive a message
    try {
      const message = await client.waitForMessage(
        targetTopic,
        'sensor_msgs/LaserScan',
        SCAN_TIMEOUT
      )

      client.disconnect()

      const scanMsg = message as { ranges?: number[]; angle_min?: number }
      const hasRanges = Array.isArray(scanMsg?.ranges) && scanMsg.ranges.length > 0

      if (hasRanges) {
        return {
          name: 'Scan Subscription',
          passed: true,
          message: `Received LaserScan data from ${targetTopic}`,
          data: {
            topic: targetTopic,
            rangeCount: scanMsg.ranges?.length,
            angleMin: scanMsg.angle_min,
          },
        }
      } else {
        return {
          name: 'Scan Subscription',
          passed: false,
          message: `Received message but no valid range data from ${targetTopic}`,
          data: { keys: Object.keys(scanMsg || {}) },
        }
      }
    } catch (timeoutError) {
      client.disconnect()
      return {
        name: 'Scan Subscription',
        passed: false,
        message: `Timeout waiting for scan data from ${targetTopic} (no messages in ${SCAN_TIMEOUT / 1000}s)`,
        data: {
          topic: targetTopic,
          hint: 'The topic exists but may not be publishing data. Check if the simulation is running.',
        },
      }
    }
  } catch (error) {
    client.disconnect()
    return {
      name: 'Scan Subscription',
      passed: false,
      message: `Error during scan test: ${(error as Error).message}`,
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60))
  console.log('  ROSBridge Verification Script')
  console.log('  Topic Inspector Feature Validation')
  console.log('='.repeat(60) + '\n')

  const url = process.argv[2] || DEFAULT_URL
  log('info', `Target: ${url}\n`)

  const results: CheckpointResult[] = []

  // Run checkpoints
  results.push(await checkpoint1_Connection(url))
  console.log('')

  if (results[0].passed) {
    results.push(await checkpoint2_TopicList(url))
    console.log('')

    if (results[1].passed) {
      results.push(await checkpoint3_ScanSubscription(url))
      console.log('')
    }
  }

  // Summary
  console.log('='.repeat(60))
  console.log('  VERIFICATION SUMMARY')
  console.log('='.repeat(60) + '\n')

  let allPassed = true
  for (const result of results) {
    const icon = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
    const status = result.passed ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m'
    console.log(`${icon} ${result.name}: ${status}`)
    console.log(`   ${result.message}`)
    if (result.data) {
      console.log(`   Data: ${JSON.stringify(result.data, null, 2).split('\n').join('\n   ')}`)
    }
    console.log('')
    if (!result.passed) allPassed = false
  }

  const passedCount = results.filter((r) => r.passed).length
  const totalCount = results.length

  console.log('='.repeat(60))
  console.log(
    `  Result: ${passedCount}/${totalCount} checkpoints passed` +
      (allPassed ? ' \x1b[32m(ALL PASSED)\x1b[0m' : ' \x1b[31m(SOME FAILED)\x1b[0m')
  )
  console.log('='.repeat(60) + '\n')

  process.exit(allPassed ? 0 : 1)
}

main().catch((error) => {
  log('error', 'Verification failed with error:', error)
  process.exit(1)
})
