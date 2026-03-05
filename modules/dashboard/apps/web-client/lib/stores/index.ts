/**
 * Stores Index
 *
 * Central export point for all Zustand stores.
 */

export {
  useWebSocketStore,
  type WebSocketState,
  type WebSocketActions,
  type WebSocketStore,
} from './websocket-store'

export { useRobotStore, type RobotState, type RobotActions, type RobotStore } from './robot-store'

export {
  useDashboardStore,
  DEFAULT_WIDGETS,
  DEFAULT_LAYOUT,
  type DashboardLayoutState,
  type DashboardLayoutActions,
  type DashboardStore,
} from './dashboard-store'

export {
  useTabStore,
  type Tab,
  type TabLayoutItem,
  type TabStoreState,
  type TabStoreActions,
  type TabStore,
} from './tab-store'

export {
  useCostmapStore,
  selectMainMap,
  type OccupancyGridData,
  type GridOrigin,
  type CostmapStore,
} from './costmap-store'

export {
  usePathStore,
  isNavigating,
  getPathLength,
  type PathData,
  type PathPoint,
  type GoalPose,
  type PathStore,
} from './path-store'

export {
  useImuStore,
  selectRobot0Imu,
  getAccelerationMagnitude,
  radToDeg,
  type ImuData,
  type Vector3,
  type Quaternion,
  type EulerAngles,
  type ImuStore,
} from './imu-store'

export {
  useMachineStatsStore,
  startMachineStatsTimeoutChecker,
  type MachineStatsState,
  type MachineStatsActions,
  type MachineStatsStore,
} from './machine-stats-store'

export { useAuthStore, type AuthUser, type UserRole, type AuthState } from './auth-store'

export {
  useIncidentStore,
  type Incident,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentFilters,
  type IncidentState,
  type IncidentActions,
  type IncidentStore,
} from './incident-store'

export {
  useDecisionBoardStore,
  formatCountdown,
  type DecisionSeverity,
  type DecisionVariant,
  type DecisionHypothesis,
  type DecisionCountdown,
  type DecisionAuditEntry,
  type DecisionBoardState,
  type DecisionBoardActions,
  type DecisionBoardStore,
} from './decision-board-store'

export {
  useWebRTCConnectionStore,
  MAX_WEBRTC_CONNECTIONS,
  type WebRTCConnectionState,
  type WebRTCConnectionActions,
  type WebRTCConnectionEntry,
  type WebRTCConnectionStore,
} from './webrtc-connection-store'
