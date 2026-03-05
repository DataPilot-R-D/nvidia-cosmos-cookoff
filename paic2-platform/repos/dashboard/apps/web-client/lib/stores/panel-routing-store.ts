/**
 * Panel Routing Store
 *
 * Zustand store for dynamic topic-to-panel routing.
 * Manages which ROS topic is currently assigned to each visualization panel.
 *
 * @see Dynamic Topic Routing (Foxglove-style)
 */

import { create } from 'zustand'
import type { ModuleType } from '@/components/widgets/ModuleRegistry'
import { getTargetPanel, canVisualize } from '@/lib/config/TopicRegistry'

// =============================================================================
// Types
// =============================================================================

/**
 * Topic assignment for a panel
 */
export interface TopicAssignment {
  /** ROS topic name */
  topicName: string
  /** ROS message type */
  msgType: string
  /** Timestamp when assigned */
  assignedAt: number
}

/**
 * Panel routing state
 */
export interface PanelRoutingState {
  /** Map of panel type to assigned topic */
  panels: Record<string, TopicAssignment | null>
  /** History of topic assignments (last 10) */
  history: Array<{
    panelType: string
    assignment: TopicAssignment
  }>
}

/**
 * Panel routing actions
 */
export interface PanelRoutingActions {
  /** Visualize a topic in appropriate panel */
  visualizeTopic: (topicName: string, msgType: string) => ModuleType | null
  /** Manually assign topic to panel */
  assignTopic: (panelType: ModuleType, topicName: string, msgType: string) => void
  /** Clear topic from panel */
  clearPanel: (panelType: ModuleType) => void
  /** Get active topic for a panel */
  getActiveTopic: (panelType: ModuleType) => TopicAssignment | null
  /** Clear all assignments */
  clearAll: () => void
}

// =============================================================================
// Initial State
// =============================================================================

const initialState: PanelRoutingState = {
  panels: {},
  history: [],
}

// =============================================================================
// Store Implementation
// =============================================================================

export const usePanelRoutingStore = create<PanelRoutingState & PanelRoutingActions>((set, get) => ({
  ...initialState,

  /**
   * Visualize a topic in the appropriate panel based on message type.
   * Returns the target panel type, or null if not visualizable.
   */
  visualizeTopic: (topicName: string, msgType: string): ModuleType | null => {
    if (!canVisualize(msgType)) {
      return null
    }

    const targetPanel = getTargetPanel(msgType)
    if (!targetPanel) {
      return null
    }

    const assignment: TopicAssignment = {
      topicName,
      msgType,
      assignedAt: Date.now(),
    }

    set((state) => ({
      panels: {
        ...state.panels,
        [targetPanel]: assignment,
      },
      history: [
        { panelType: targetPanel, assignment },
        ...state.history.slice(0, 9), // Keep last 10
      ],
    }))

    return targetPanel
  },

  /**
   * Manually assign a topic to a specific panel
   */
  assignTopic: (panelType: ModuleType, topicName: string, msgType: string) => {
    const assignment: TopicAssignment = {
      topicName,
      msgType,
      assignedAt: Date.now(),
    }

    set((state) => ({
      panels: {
        ...state.panels,
        [panelType]: assignment,
      },
      history: [{ panelType, assignment }, ...state.history.slice(0, 9)],
    }))
  },

  /**
   * Clear topic assignment from a panel
   */
  clearPanel: (panelType: ModuleType) => {
    set((state) => ({
      panels: {
        ...state.panels,
        [panelType]: null,
      },
    }))
  },

  /**
   * Get the active topic for a panel
   */
  getActiveTopic: (panelType: ModuleType): TopicAssignment | null => {
    return get().panels[panelType] ?? null
  },

  /**
   * Clear all topic assignments
   */
  clearAll: () => {
    set({
      panels: {},
      history: [],
    })
  },
}))

// =============================================================================
// Selectors
// =============================================================================

/**
 * Select active topic for a specific panel
 */
export const selectPanelTopic = (panelType: ModuleType) => {
  return usePanelRoutingStore.getState().panels[panelType] ?? null
}

export type PanelRoutingStore = typeof usePanelRoutingStore
