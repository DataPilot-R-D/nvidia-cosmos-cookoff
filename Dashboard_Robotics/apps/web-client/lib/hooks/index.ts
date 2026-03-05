/**
 * Hooks Index
 *
 * Central export point for all custom React hooks.
 */

export { useWebSocket, type UseWebSocketReturn } from './use-websocket'
export {
  usePermission,
  usePermissions,
  hasPermission,
  getPermissions,
  type Permission,
} from './use-permission'
export { useWebRTCGuardrail } from './use-webrtc-guardrail'
export {
  useCameraSourcePolling,
  type UseCameraSourcePollingResult,
} from './use-camera-source-polling'
