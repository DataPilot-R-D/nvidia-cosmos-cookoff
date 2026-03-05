/**
 * Widgets Index
 *
 * Central export point for all dashboard widgets.
 */

// Legacy exports (may be deprecated)
export { WidgetWrapper } from './WidgetWrapper'
export type { WidgetWrapperProps } from './WidgetWrapper'

export { DashboardWindowFrame } from './DashboardWindowFrame'
export type { DashboardWindowFrameProps, RosTopicOption } from './DashboardWindowFrame'

export { InteractiveJoystick } from './InteractiveJoystick'
export type { InteractiveJoystickProps, JoystickPosition } from './InteractiveJoystick'

export { RobotWidget } from './RobotWidget'
export type { RobotCardProps } from './RobotWidget'

// Universal Window System (new architecture)
export { GenericWindow } from './GenericWindow'
export type { GenericWindowProps } from './GenericWindow'

export {
  getModuleComponent,
  getModuleDefinition,
  isValidModuleType,
  getAllModuleDefinitions,
  MODULE_DEFINITIONS,
  MODULE_METADATA,
  // Module components (can be used directly if needed)
  EmptyModule,
  RobotStatusModule,
  AiChatModule,
  CameraModule,
  Map3dModule,
  Map2dModule,
  LidarModule,
  ControlsModule,
  MachineUsageModule,
  DecisionBoardModule,
} from './ModuleRegistry'

export type { ModuleType, ModuleDefinition, ModuleProps } from './ModuleRegistry'
