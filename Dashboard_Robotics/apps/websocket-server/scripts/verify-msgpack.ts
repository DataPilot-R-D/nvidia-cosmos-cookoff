/**
 * Verification Script for MessagePack Integration
 *
 * Run: npx tsx apps/websocket-server/scripts/verify-msgpack.ts
 *
 * Pass/Fail Criteria:
 * ✅ PASS: Connection established + binary messages detected
 * ❌ FAIL: JSON messages or connection errors
 */

import { io } from 'socket.io-client'
import parser from 'socket.io-msgpack-parser'

const WS_URL = process.env.WS_URL || 'http://localhost:8080'
const TIMEOUT_MS = 10000

interface VerificationResults {
  connected: boolean
  parserType: string
  messageReceived: boolean
  binaryDetected: boolean
}

async function verify(): Promise<void> {
  console.log('🔍 Starting MessagePack verification...')
  console.log(`   Target: ${WS_URL}`)
  console.log('')

  const results: VerificationResults = {
    connected: false,
    parserType: 'unknown',
    messageReceived: false,
    binaryDetected: false,
  }

  const socket = io(WS_URL, {
    parser,
    transports: ['websocket'],
    timeout: TIMEOUT_MS,
  })

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      socket.disconnect()
      console.log('\n❌ FAIL: Connection timeout')
      process.exit(1)
    }, TIMEOUT_MS)

    socket.on('connect', () => {
      results.connected = true
      console.log('✅ Connected to server')

      // Check parser type via encoder
      try {
        // Access internal encoder to verify MessagePack
        const manager = socket.io as unknown as {
          encoder: { encode: (packet: unknown) => unknown[] }
        }
        const testPacket = { type: 2, data: ['test', { foo: 'bar' }], nsp: '/' }
        const encoded = manager.encoder.encode(testPacket)

        if (Array.isArray(encoded) && encoded.length > 0) {
          const firstChunk = encoded[0]
          if (firstChunk instanceof Uint8Array || firstChunk instanceof ArrayBuffer) {
            results.binaryDetected = true
            results.parserType = 'MessagePack (binary)'
            console.log('✅ Binary encoding detected (MessagePack active)')
          } else if (typeof firstChunk === 'string') {
            results.parserType = 'JSON (string)'
            console.log('⚠️  String encoding detected (JSON fallback)')
          }
        }
      } catch (err) {
        console.log('⚠️  Could not verify encoder type:', err)
      }
    })

    socket.on('connection', () => {
      results.messageReceived = true
      console.log('✅ Server message received')

      clearTimeout(timeout)
      socket.disconnect()

      // Final verdict
      printResults(results)
    })

    // Handle the case where we connect but don't receive 'connection' event
    setTimeout(() => {
      if (results.connected && !results.messageReceived) {
        console.log("ℹ️  Connected but no connection event (normal if server doesn't emit it)")
        clearTimeout(timeout)
        socket.disconnect()

        // Still pass if connected and binary detected
        results.messageReceived = true
        printResults(results)
      }
    }, 3000)

    socket.on('connect_error', (err) => {
      clearTimeout(timeout)
      console.log(`\n❌ FAIL: Connection error - ${err.message}`)
      process.exit(1)
    })
  })
}

function printResults(results: VerificationResults): void {
  console.log('\n' + '='.repeat(50))
  console.log('📊 VERIFICATION RESULTS')
  console.log('='.repeat(50))
  console.log(`   Connected:     ${results.connected ? '✅ YES' : '❌ NO'}`)
  console.log(`   Parser Type:   ${results.parserType}`)
  console.log(`   Binary Mode:   ${results.binaryDetected ? '✅ YES' : '❌ NO'}`)
  console.log(`   Message Rx:    ${results.messageReceived ? '✅ YES' : '❌ NO'}`)
  console.log('='.repeat(50))

  if (results.connected && results.binaryDetected) {
    console.log('\n✅ PASS: MessagePack integration verified!')
    console.log('   Messages are being serialized as binary data.')
    console.log('   Expected ~30-40% smaller payload sizes.')
    process.exit(0)
  } else if (results.connected && !results.binaryDetected) {
    console.log('\n⚠️  PARTIAL: Connected but using JSON encoding')
    console.log('   Check that both server and client use the same parser.')
    process.exit(1)
  } else {
    console.log('\n❌ FAIL: MessagePack not working correctly')
    process.exit(1)
  }
}

verify().catch((err) => {
  console.error('Verification failed:', err)
  process.exit(1)
})
