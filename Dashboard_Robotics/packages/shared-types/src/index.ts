/**
 * Shared Types for Security Robot Command Center
 *
 * This package contains TypeScript types and Zod schemas shared across:
 * - web-client (Next.js Dashboard)
 * - websocket-server (Node.js)
 * - ros-bridge (Python - via generated types)
 *
 * @module @workspace/shared-types
 */

// Base message schema (shared by all message types)
export * from './base'

// Core WebSocket message types
export * from './websocket'

// Robot entity types
export * from './robot'

// Dashboard widget types
export * from './dashboard'

// Camera entity and discovery types
export * from './camera'

// Video streaming and WebRTC types
export * from './video'

// LIDAR point cloud types
export * from './lidar'

// Vision LLM types
export * from './vision-llm'

// Map management types
export * from './maps'

// Machine stats types (server monitoring)
export * from './machine-stats'
