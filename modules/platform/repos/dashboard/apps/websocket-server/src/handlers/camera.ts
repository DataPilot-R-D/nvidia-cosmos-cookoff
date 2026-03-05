/**
 * Camera Event Handlers
 *
 * Handles camera discovery and streaming events:
 * - camera_discovered: New camera detected by ROS bridge
 * - camera_lost: Camera no longer available
 * - camera_subscribe: Client wants to receive camera frames
 * - camera_unsubscribe: Client stops receiving camera frames
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Logger } from 'pino'

// =============================================================================
// Types
// =============================================================================

export interface CameraEntity {
  id: string
  robotId: string
  name: string
  topic: string
  status: string
  capabilities: {
    supportsWebRTC: boolean
    supportsHLS: boolean
    supportsPTZ: boolean
    maxResolution: { width: number; height: number }
    maxFps: number
  }
  hlsUrl?: string
  webrtcEnabled: boolean
}

export interface CameraRegistry {
  cameras: Map<string, CameraEntity>
  subscriptions: Map<string, Set<string>> // cameraId -> Set<socketId>
}

// =============================================================================
// Camera Registry
// =============================================================================

/**
 * Create a new camera registry
 */
export function createCameraRegistry(): CameraRegistry {
  return {
    cameras: new Map(),
    subscriptions: new Map(),
  }
}

// =============================================================================
// Camera Event Handlers
// =============================================================================

/**
 * Register camera event handlers for a socket
 */
export function registerCameraHandlers(
  io: SocketIOServer,
  socket: Socket,
  registry: CameraRegistry,
  logger: Logger
): void {
  // Handle camera discovered (from ROS bridge)
  socket.on(
    'camera_discovered',
    (data: { type: string; timestamp: number; data: CameraEntity }) => {
      const camera = data.data
      logger.info({ cameraId: camera.id, name: camera.name }, 'Camera discovered')

      // Add to registry
      registry.cameras.set(camera.id, camera)

      // Broadcast to all clients
      io.emit('camera_discovered', data)
    }
  )

  // Handle camera lost (from ROS bridge)
  socket.on(
    'camera_lost',
    (data: { type: string; timestamp: number; data: { cameraId: string; robotId: string } }) => {
      const { cameraId } = data.data
      logger.info({ cameraId }, 'Camera lost')

      // Remove from registry
      registry.cameras.delete(cameraId)

      // Clean up subscriptions
      registry.subscriptions.delete(cameraId)

      // Broadcast to all clients
      io.emit('camera_lost', data)
    }
  )

  // Handle camera subscribe (from web client)
  socket.on(
    'camera_subscribe',
    (data: {
      type: string
      timestamp: number
      data: { cameraId: string; robotId: string; quality?: number; maxFps?: number }
    }) => {
      const { cameraId } = data.data
      logger.info({ socketId: socket.id, cameraId }, 'Camera subscribe')

      // Add socket to camera's subscribers
      if (!registry.subscriptions.has(cameraId)) {
        registry.subscriptions.set(cameraId, new Set())
      }
      registry.subscriptions.get(cameraId)!.add(socket.id)

      // Join camera room for targeted broadcasts
      socket.join(`camera:${cameraId}`)

      // Forward to ROS bridge
      socket.broadcast.emit('camera_subscribe', data)
    }
  )

  // Handle camera unsubscribe (from web client)
  socket.on(
    'camera_unsubscribe',
    (data: { type: string; timestamp: number; data: { cameraId: string } }) => {
      const { cameraId } = data.data
      logger.info({ socketId: socket.id, cameraId }, 'Camera unsubscribe')

      // Remove socket from camera's subscribers
      registry.subscriptions.get(cameraId)?.delete(socket.id)

      // Leave camera room
      socket.leave(`camera:${cameraId}`)

      // Forward to ROS bridge
      socket.broadcast.emit('camera_unsubscribe', data)
    }
  )

  // Handle video frame (from ROS bridge)
  socket.on(
    'video_frame',
    (data: {
      type: string
      timestamp: number
      data: {
        cameraId: string
        robotId: string
        format: string
        width: number
        height: number
        frameNumber: number
        frameData: string
      }
    }) => {
      const { cameraId } = data.data

      // Only send to subscribed clients (via room)
      io.to(`camera:${cameraId}`).emit('video_frame', data)
    }
  )

  // Clean up on disconnect
  socket.on('disconnect', () => {
    // Remove socket from all camera subscriptions
    for (const subscribers of registry.subscriptions.values()) {
      subscribers.delete(socket.id)
    }
  })
}

/**
 * Get list of known cameras
 */
export function getKnownCameras(registry: CameraRegistry): CameraEntity[] {
  return Array.from(registry.cameras.values())
}

/**
 * Get camera by ID
 */
export function getCameraById(
  registry: CameraRegistry,
  cameraId: string
): CameraEntity | undefined {
  return registry.cameras.get(cameraId)
}

/**
 * Get subscribers for a camera
 */
export function getCameraSubscribers(registry: CameraRegistry, cameraId: string): string[] {
  return Array.from(registry.subscriptions.get(cameraId) ?? [])
}
