/**
 * ROSBridge Handlers Module
 *
 * Re-exports all ROSBridge functionality.
 * Structure prepared for future extraction of individual handlers.
 *
 * Future structure:
 * - types.ts (done)
 * - camera-handler.ts (planned)
 * - lidar-handler.ts (planned)
 * - nav-handler.ts (planned)
 * - sensor-handler.ts (planned)
 * - client.ts (main connection logic)
 */

// Re-export types and configuration
export * from './types.js'

// Re-export main client functions from legacy file
// These will be moved to client.ts in future iterations
export {
  createRosbridgeClient,
  setCurrentRosbridgeClient,
  getCurrentRosbridgeUrl,
  registerRosbridgeHandlers,
  getDiscoveredCameras,
} from './client.js'
