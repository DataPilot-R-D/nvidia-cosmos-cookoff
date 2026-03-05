/**
 * ModuleRegistry Tests
 *
 * TDD tests for Component Registry
 */

import { render, screen } from '@testing-library/react'

import {
  getModuleComponent,
  getModuleDefinition,
  isValidModuleType,
  getAllModuleDefinitions,
  MODULE_DEFINITIONS,
  EmptyModule,
  RobotStatusModule,
  AiChatModule,
  CameraModule,
  Map3dModule,
  Map2dModule,
  LidarModule,
  ControlsModule,
  type ModuleType,
} from '../ModuleRegistry'

describe('ModuleRegistry', () => {
  // ===========================================================================
  // getModuleComponent Tests
  // ===========================================================================

  describe('getModuleComponent', () => {
    it('returns EmptyModule for "empty" type', () => {
      const Component = getModuleComponent('empty')
      expect(Component).toBe(EmptyModule)
    })

    it('returns RobotStatusModule for "robot-status" type', () => {
      const Component = getModuleComponent('robot-status')
      expect(Component).toBe(RobotStatusModule)
    })

    it('returns AiChatModule for "ai-chat" type', () => {
      const Component = getModuleComponent('ai-chat')
      expect(Component).toBe(AiChatModule)
    })

    it('returns CameraModule for "camera" type', () => {
      const Component = getModuleComponent('camera')
      expect(Component).toBe(CameraModule)
    })

    it('returns Map3dModule for "map-3d" type', () => {
      const Component = getModuleComponent('map-3d')
      expect(Component).toBe(Map3dModule)
    })

    it('returns Map2dModule for "map-2d" type', () => {
      const Component = getModuleComponent('map-2d')
      expect(Component).toBe(Map2dModule)
    })

    it('returns LidarModule for "lidar" type', () => {
      const Component = getModuleComponent('lidar')
      expect(Component).toBe(LidarModule)
    })

    it('returns ControlsModule for "controls" type', () => {
      const Component = getModuleComponent('controls')
      expect(Component).toBe(ControlsModule)
    })

    it('returns EmptyModule for unknown type', () => {
      const Component = getModuleComponent('unknown-type' as ModuleType)
      expect(Component).toBe(EmptyModule)
    })
  })

  // ===========================================================================
  // getModuleDefinition Tests
  // ===========================================================================

  describe('getModuleDefinition', () => {
    it('returns correct definition for robot-status', () => {
      const definition = getModuleDefinition('robot-status')
      expect(definition).toEqual({
        type: 'robot-status',
        label: 'Robot Status',
        description: 'Live robot monitoring',
      })
    })

    it('returns correct definition for ai-chat', () => {
      const definition = getModuleDefinition('ai-chat')
      expect(definition).toEqual({
        type: 'ai-chat',
        label: 'AI Chat',
        description: 'Command interface',
      })
    })

    it('returns empty definition for unknown type', () => {
      const definition = getModuleDefinition('unknown' as ModuleType)
      expect(definition.type).toBe('empty')
    })
  })

  // ===========================================================================
  // isValidModuleType Tests
  // ===========================================================================

  describe('isValidModuleType', () => {
    it('returns true for valid module types', () => {
      expect(isValidModuleType('empty')).toBe(true)
      expect(isValidModuleType('robot-status')).toBe(true)
      expect(isValidModuleType('ai-chat')).toBe(true)
      expect(isValidModuleType('camera')).toBe(true)
      expect(isValidModuleType('map-3d')).toBe(true)
      expect(isValidModuleType('map-2d')).toBe(true)
      expect(isValidModuleType('lidar')).toBe(true)
      expect(isValidModuleType('controls')).toBe(true)
      expect(isValidModuleType('decision-board')).toBe(true)
    })

    it('returns false for invalid module types', () => {
      expect(isValidModuleType('unknown')).toBe(false)
      expect(isValidModuleType('invalid')).toBe(false)
      expect(isValidModuleType('')).toBe(false)
    })
  })

  // ===========================================================================
  // getAllModuleDefinitions Tests
  // ===========================================================================

  describe('getAllModuleDefinitions', () => {
    it('returns all module definitions', () => {
      const definitions = getAllModuleDefinitions()
      expect(definitions).toBe(MODULE_DEFINITIONS)
      expect(definitions.length).toBe(23)
    })

    it('includes robot-status definition', () => {
      const definitions = getAllModuleDefinitions()
      const robotStatus = definitions.find((d) => d.type === 'robot-status')
      expect(robotStatus).toBeDefined()
    })

    it('does not include empty definition', () => {
      const definitions = getAllModuleDefinitions()
      const empty = definitions.find((d) => d.type === 'empty')
      expect(empty).toBeUndefined()
    })
  })

  // ===========================================================================
  // Module Component Rendering Tests
  // ===========================================================================

  describe('Module Components', () => {
    it('EmptyModule renders correctly', () => {
      render(<EmptyModule windowId="test" />)
      expect(screen.getByTestId('module-empty-test')).toBeInTheDocument()
      expect(screen.getByText('Select Module')).toBeInTheDocument()
    })

    it('RobotStatusModule renders correctly', () => {
      render(<RobotStatusModule windowId="test" />)
      expect(screen.getByTestId('module-robot-status-test')).toBeInTheDocument()
    })

    it('AiChatModule renders correctly', () => {
      render(<AiChatModule windowId="test" />)
      expect(screen.getByTestId('module-ai-chat-test')).toBeInTheDocument()
    })

    it('CameraModule renders correctly', () => {
      render(<CameraModule windowId="test" />)
      expect(screen.getByTestId('module-camera-test')).toBeInTheDocument()
    })

    it('Map3dModule renders correctly', () => {
      render(<Map3dModule windowId="test" />)
      expect(screen.getByTestId('module-map-3d-test')).toBeInTheDocument()
    })

    it('Map2dModule renders correctly', () => {
      render(<Map2dModule windowId="test" />)
      expect(screen.getByTestId('module-map-2d-test')).toBeInTheDocument()
    })

    it('LidarModule renders correctly', () => {
      render(<LidarModule windowId="test" />)
      expect(screen.getByTestId('module-lidar-test')).toBeInTheDocument()
    })

    it('ControlsModule renders correctly', () => {
      render(<ControlsModule windowId="test" />)
      expect(screen.getByTestId('module-controls-test')).toBeInTheDocument()
    })
  })
})
