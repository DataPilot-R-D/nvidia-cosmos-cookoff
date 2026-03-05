/**
 * ModuleRegistry - Component Registry for GenericWindow
 *
 * Maps module types to their React components.
 * Used by GenericWindow to dynamically render selected modules.
 *
 * @see Universal Window System Architecture
 */

import { type ComponentType, type ReactNode } from 'react'
import dynamic from 'next/dynamic'

// Lightweight modules — static imports
import { RobotStatusModule as RobotStatusModuleComponent } from './RobotStatusModule'
import { ControlsModule as ControlsModuleComponent } from './ControlsModule'
import { AiChatModule as AiChatModuleComponent } from './AiChatModule'
import { TopicListWidget as TopicListWidgetComponent } from './TopicListWidget'
import { MachineUsageModule as MachineUsageModuleComponent } from './MachineUsageModule'
import { IncidentListModule as IncidentListModuleComponent } from './IncidentListModule'
import { IncidentDetailModule as IncidentDetailModuleComponent } from './IncidentDetailModule'
import { AuditLogModule as AuditLogModuleComponent } from './AuditLogModule'
import { ZoneEditorModule as ZoneEditorModuleComponent } from './ZoneEditorModule'
import { MissionPlannerModule as MissionPlannerModuleComponent } from './MissionPlannerModule'
import { MissionDashboardModule as MissionDashboardModuleComponent } from './MissionDashboardModule'
import { TrustDashboardModule as TrustDashboardModuleComponent } from './TrustDashboardModule'
import { ReplayReviewModule as ReplayReviewModuleComponent } from './ReplayReviewModule'
import { SettingsModule as SettingsModuleComponent } from './SettingsModule'
import { AgentContextModule as AgentContextModuleComponent } from './AgentContextModule'

// Heavy modules — dynamic imports (code-split, loaded on demand)
const CameraModuleComponent = dynamic(() => import('./CameraModule').then((m) => m.CameraModule), {
  ssr: false,
})
const LidarModuleComponent = dynamic(() => import('./LidarModule').then((m) => m.LidarModule), {
  ssr: false,
})
const Map2dModuleComponent = dynamic(() => import('./map2d').then((m) => m.Map2dModule), {
  ssr: false,
})
const Map3dModuleComponent = dynamic(() => import('./Map3dModule').then((m) => m.Map3dModule), {
  ssr: false,
})
const OccupancyGridModuleComponent = dynamic(
  () => import('./OccupancyGridModule').then((m) => m.OccupancyGridModule),
  { ssr: false }
)
const ImuModuleComponent = dynamic(() => import('./ImuModule').then((m) => m.ImuModule), {
  ssr: false,
})
const CameraWallModuleComponent = dynamic(
  () => import('./CameraWallModule').then((m) => m.CameraWallModule),
  { ssr: false }
)
const DecisionBoardModuleComponent = dynamic(
  () => import('./DecisionBoardModule').then((m) => m.DecisionBoardModule),
  { ssr: false }
)

// =============================================================================
// Types
// =============================================================================

/** Available module types */
export type ModuleType =
  | 'empty'
  | 'robot-status'
  | 'ai-chat'
  | 'camera'
  | 'camera-wall'
  | 'map-3d'
  | 'map-2d'
  | 'lidar'
  | 'controls'
  | 'topic-inspector'
  | 'occupancy-grid'
  | 'imu'
  | 'machine-usage'
  | 'incident-list'
  | 'incident-detail'
  | 'audit-log'
  | 'zone-editor'
  | 'mission-planner'
  | 'mission-dashboard'
  | 'trust-dashboard'
  | 'replay-review'
  | 'decision-board'
  | 'agent-context'
  | 'settings'

/** Module metadata for UI */
export interface ModuleDefinition {
  type: ModuleType
  label: string
  description: string
  icon?: string
  category?: string
}

/** Props that all module components receive */
export interface ModuleProps {
  windowId: string
}

/** Registry entry */
interface RegistryEntry {
  component: ComponentType<ModuleProps>
  definition: ModuleDefinition
}

// =============================================================================
// Module Definitions (for Menu)
// =============================================================================

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { type: 'topic-inspector', label: 'Topic Inspector', description: 'ROS topic discovery' },
  { type: 'robot-status', label: 'Robot Status', description: 'Live robot monitoring' },
  { type: 'machine-usage', label: 'Machine Usage', description: 'Server CPU/RAM monitoring' },
  { type: 'incident-list', label: 'Incident List', description: 'Incident queue + filters' },
  { type: 'incident-detail', label: 'Incident Detail', description: 'Incident details + actions' },
  { type: 'audit-log', label: 'Audit Log', description: 'Append-only command audit trail' },
  { type: 'zone-editor', label: 'Zone Editor', description: 'Create and manage map zones' },
  {
    type: 'mission-planner',
    label: 'Mission Planner',
    description: 'Create, dispatch & track missions',
  },
  {
    type: 'mission-dashboard',
    label: 'Mission Dashboard',
    description: 'Real-time mission status, progress & robot assignments',
  },
  {
    type: 'replay-review',
    label: 'Replay & Review',
    description: 'Timeline of evidence events with video sync & filtering',
  },
  {
    type: 'trust-dashboard',
    label: 'Trust & Handover',
    description: 'Robot trust scores, risk indicators & handover controls',
  },
  {
    type: 'decision-board',
    label: 'Decision Board',
    description: 'C2 incident view with variants, HOTL timer and audit trail',
    icon: '⚡',
    category: 'operations',
  },
  {
    type: 'agent-context',
    label: 'Agent Context',
    description: 'OpenClaw agent token usage monitor',
    icon: '🤖',
    category: 'operations',
  },
  { type: 'ai-chat', label: 'AI Chat', description: 'Command interface' },
  { type: 'camera', label: 'Camera', description: 'Live camera feed' },
  { type: 'camera-wall', label: 'Camera Wall', description: 'SOC-style multi-camera grid' },
  { type: 'map-3d', label: '3D Map', description: 'Point cloud visualization' },
  { type: 'map-2d', label: '2D Map', description: 'Floor plan view' },
  { type: 'lidar', label: 'Lidar Scan', description: 'Laser scan display' },
  { type: 'controls', label: 'Controls', description: 'Precision control panel' },
  { type: 'occupancy-grid', label: 'Occupancy Grid', description: 'SLAM/costmap visualization' },
  { type: 'imu', label: 'IMU', description: '3D orientation & motion' },
  {
    type: 'settings',
    label: 'Settings',
    description: 'Dashboard settings: connection, display, notifications',
  },
]

export const MODULE_METADATA = MODULE_DEFINITIONS

// =============================================================================
// Placeholder Components (can be replaced with actual implementations)
// =============================================================================

/** Empty state placeholder */
export function EmptyModule({ windowId }: ModuleProps): ReactNode {
  return (
    <div
      className="h-full flex flex-col items-center justify-center gap-2"
      data-testid={`module-empty-${windowId}`}
    >
      <div className="w-8 h-8 rounded-full border border-[#333333] flex items-center justify-center">
        <span className="text-[#444444] text-xs">?</span>
      </div>
      <span className="text-[10px] text-[#555555] uppercase tracking-wider font-medium">
        Select Module
      </span>
      <span className="text-[9px] text-[#444444]">Use menu [v] to choose</span>
    </div>
  )
}

// Aliases for registry (static imports keep their names, dynamic are already assigned above)
const RobotStatusModuleImpl = RobotStatusModuleComponent
const AiChatModuleImpl = AiChatModuleComponent
const CameraModuleImpl = CameraModuleComponent
const Map3dModuleImpl = Map3dModuleComponent
const Map2dModuleImpl = Map2dModuleComponent
const LidarModuleImpl = LidarModuleComponent
const ControlsModuleImpl = ControlsModuleComponent
const TopicListWidgetImpl = TopicListWidgetComponent
const OccupancyGridModuleImpl = OccupancyGridModuleComponent
const ImuModuleImpl = ImuModuleComponent
const MachineUsageModuleImpl = MachineUsageModuleComponent
const CameraWallModuleImpl = CameraWallModuleComponent
const IncidentListModuleImpl = IncidentListModuleComponent
const IncidentDetailModuleImpl = IncidentDetailModuleComponent
const AuditLogModuleImpl = AuditLogModuleComponent
const ZoneEditorModuleImpl = ZoneEditorModuleComponent
const MissionPlannerModuleImpl = MissionPlannerModuleComponent
const MissionDashboardModuleImpl = MissionDashboardModuleComponent
const ReplayReviewModuleImpl = ReplayReviewModuleComponent
const TrustDashboardModuleImpl = TrustDashboardModuleComponent
const DecisionBoardModuleImpl = DecisionBoardModuleComponent
const AgentContextModuleImpl = AgentContextModuleComponent
const SettingsModuleImpl = SettingsModuleComponent

// Re-exports for backwards compatibility (static modules only)
export { RobotStatusModule } from './RobotStatusModule'
export { AiChatModule } from './AiChatModule'
export { ControlsModule } from './ControlsModule'
export { TopicListWidget } from './TopicListWidget'
export { MachineUsageModule } from './MachineUsageModule'
export { IncidentListModule } from './IncidentListModule'
export { IncidentDetailModule } from './IncidentDetailModule'
export { AuditLogModule } from './AuditLogModule'
export { ZoneEditorModule } from './ZoneEditorModule'
export { MissionPlannerModule } from './MissionPlannerModule'
export { MissionDashboardModule } from './MissionDashboardModule'
export { ReplayReviewModule } from './ReplayReviewModule'
export { TrustDashboardModule } from './TrustDashboardModule'
export { AgentContextModule } from './AgentContextModule'
export { SettingsModule } from './SettingsModule'

// Heavy modules — re-export via dynamic references
export {
  CameraWallModuleComponent as CameraWallModule,
  CameraModuleComponent as CameraModule,
  Map3dModuleComponent as Map3dModule,
  Map2dModuleComponent as Map2dModule,
  LidarModuleComponent as LidarModule,
  OccupancyGridModuleComponent as OccupancyGridModule,
  ImuModuleComponent as ImuModule,
  DecisionBoardModuleComponent as DecisionBoardModule,
}

// =============================================================================
// Module Registry
// =============================================================================

const MODULE_REGISTRY: Record<ModuleType, RegistryEntry> = {
  empty: {
    component: EmptyModule,
    definition: { type: 'empty', label: 'Empty', description: 'No module selected' },
  },
  'robot-status': {
    component: RobotStatusModuleImpl,
    definition: {
      type: 'robot-status',
      label: 'Robot Status',
      description: 'Live robot monitoring',
    },
  },
  'ai-chat': {
    component: AiChatModuleImpl,
    definition: { type: 'ai-chat', label: 'AI Chat', description: 'Command interface' },
  },
  camera: {
    component: CameraModuleImpl,
    definition: { type: 'camera', label: 'Camera', description: 'Live camera feed' },
  },
  'camera-wall': {
    component: CameraWallModuleImpl,
    definition: {
      type: 'camera-wall',
      label: 'Camera Wall',
      description: 'SOC-style multi-camera grid',
    },
  },
  'map-3d': {
    component: Map3dModuleImpl,
    definition: { type: 'map-3d', label: '3D Map', description: 'Point cloud visualization' },
  },
  'map-2d': {
    component: Map2dModuleImpl,
    definition: { type: 'map-2d', label: '2D Map', description: 'Floor plan view' },
  },
  lidar: {
    component: LidarModuleImpl,
    definition: { type: 'lidar', label: 'Lidar Scan', description: 'Laser scan display' },
  },
  controls: {
    component: ControlsModuleImpl,
    definition: { type: 'controls', label: 'Controls', description: 'Precision control panel' },
  },
  'topic-inspector': {
    component: TopicListWidgetImpl,
    definition: {
      type: 'topic-inspector',
      label: 'Topic Inspector',
      description: 'ROS topic discovery',
    },
  },
  'occupancy-grid': {
    component: OccupancyGridModuleImpl,
    definition: {
      type: 'occupancy-grid',
      label: 'Occupancy Grid',
      description: 'SLAM/costmap visualization',
    },
  },
  imu: {
    component: ImuModuleImpl,
    definition: { type: 'imu', label: 'IMU', description: '3D orientation & motion' },
  },
  'machine-usage': {
    component: MachineUsageModuleImpl,
    definition: {
      type: 'machine-usage',
      label: 'Machine Usage',
      description: 'Server CPU/RAM monitoring',
    },
  },
  'incident-list': {
    component: IncidentListModuleImpl,
    definition: {
      type: 'incident-list',
      label: 'Incident List',
      description: 'Incident queue + filters',
    },
  },
  'incident-detail': {
    component: IncidentDetailModuleImpl,
    definition: {
      type: 'incident-detail',
      label: 'Incident Detail',
      description: 'Incident details + actions',
    },
  },
  'audit-log': {
    component: AuditLogModuleImpl,
    definition: {
      type: 'audit-log',
      label: 'Audit Log',
      description: 'Append-only command audit trail',
    },
  },
  'zone-editor': {
    component: ZoneEditorModuleImpl,
    definition: {
      type: 'zone-editor',
      label: 'Zone Editor',
      description: 'Create and manage map zones',
    },
  },
  'mission-planner': {
    component: MissionPlannerModuleImpl,
    definition: {
      type: 'mission-planner',
      label: 'Mission Planner',
      description: 'Create, dispatch & track missions',
    },
  },
  'mission-dashboard': {
    component: MissionDashboardModuleImpl,
    definition: {
      type: 'mission-dashboard',
      label: 'Mission Dashboard',
      description: 'Real-time mission status, progress & robot assignments',
    },
  },
  'replay-review': {
    component: ReplayReviewModuleImpl,
    definition: {
      type: 'replay-review',
      label: 'Replay & Review',
      description: 'Timeline of evidence events with video sync & filtering',
    },
  },
  'trust-dashboard': {
    component: TrustDashboardModuleImpl,
    definition: {
      type: 'trust-dashboard',
      label: 'Trust & Handover',
      description: 'Robot trust scores, risk indicators & handover controls',
    },
  },
  'decision-board': {
    component: DecisionBoardModuleImpl,
    definition: {
      type: 'decision-board',
      label: 'Decision Board',
      description: 'C2 incident view with variants, HOTL timer and audit trail',
      icon: '⚡',
      category: 'operations',
    },
  },
  'agent-context': {
    component: AgentContextModuleImpl,
    definition: {
      type: 'agent-context',
      label: 'Agent Context',
      description: 'OpenClaw agent token usage monitor',
      icon: '🤖',
      category: 'operations',
    },
  },
  settings: {
    component: SettingsModuleImpl,
    definition: {
      type: 'settings',
      label: 'Settings',
      description: 'Dashboard settings: connection, display, notifications',
    },
  },
}

// =============================================================================
// Registry API
// =============================================================================

/**
 * Get component for a module type
 */
export function getModuleComponent(type: ModuleType): ComponentType<ModuleProps> {
  return MODULE_REGISTRY[type]?.component ?? EmptyModule
}

/**
 * Get definition for a module type
 */
export function getModuleDefinition(type: ModuleType): ModuleDefinition {
  return MODULE_REGISTRY[type]?.definition ?? MODULE_REGISTRY.empty.definition
}

/**
 * Check if a type is a valid module type
 */
export function isValidModuleType(type: string): type is ModuleType {
  return type in MODULE_REGISTRY
}

/**
 * Get all available module definitions (for menu)
 */
export function getAllModuleDefinitions(): ModuleDefinition[] {
  return MODULE_DEFINITIONS
}

export default MODULE_REGISTRY
