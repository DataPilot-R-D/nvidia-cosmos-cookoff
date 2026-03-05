/**
 * Map Manager Service
 *
 * Manages the lifecycle of SLAM, Exploration, and MapServer processes.
 * Handles switching between exploration mode (SLAM + Explore Lite) and navigation mode (MapServer).
 *
 * Features:
 * - Process lifecycle management (SLAM + Explore vs MapServer)
 * - Socket.IO event handling for load_map_to_nav2, start_slam, stop_exploration
 * - Child process management using Bun.spawn
 * - Status broadcasting to clients
 *
 * SIMULATION MODE: Configured with use_sim_time:=true for Isaac Sim / Gazebo
 *
 * @requires ros-humble-slam-toolbox
 * @requires ros-humble-explore-lite
 * @requires ros-humble-nav2-bringup
 */

import type { Server as SocketIOServer, Socket } from 'socket.io'
import type { Logger } from 'pino'
import type { Subprocess } from 'bun'
import { resolve } from 'path'
import {
  type MapManagerMode,
  type MapLoadingStatus,
  parseLoadMapToNav2Request,
} from '@workspace/shared-types'
import { loadMap, exportMapToFilesystem } from '../storage/map-storage.js'

// =============================================================================
// Configuration
// =============================================================================

/**
 * Simulation mode flag - enables use_sim_time for ROS2 launch files
 * Set to false for real robot deployment
 */
const USE_SIM_TIME = true

/**
 * Process startup delay in ms - wait for ROS2 nodes to initialize
 */
const PROCESS_STARTUP_DELAY = 3000

/**
 * ROS2 shell command prefix - sources ROS2 environment before running commands
 * This ensures ROS2 commands work even when the service is started without sourcing
 */
const ROS2_SOURCE_CMD =
  'source /opt/ros/humble/setup.bash && source ~/ros2_ws/install/setup.bash 2>/dev/null; source ~/explore_ws/install/setup.bash 2>/dev/null; '

// =============================================================================
// Types
// =============================================================================

interface MapManagerState {
  mode: MapManagerMode
  loadedMapId: string | null
  loadedMapName: string | null
  loadingStatus: MapLoadingStatus
  loadingError: string | null
  /** Whether explore_lite is actively running */
  isExploring: boolean
}

interface DependencyStatus {
  slamToolbox: boolean
  exploreLite: boolean
  nav2Bringup: boolean
}

// =============================================================================
// Map Manager Class
// =============================================================================

export class MapManagerService {
  private io: SocketIOServer
  private logger: Logger

  // Process references
  private slamProcess: Subprocess | null = null
  private exploreProcess: Subprocess | null = null
  private mapServerProcess: Subprocess | null = null

  // Current state
  private state: MapManagerState = {
    mode: 'none',
    loadedMapId: null,
    loadedMapName: null,
    loadingStatus: 'idle',
    loadingError: null,
    isExploring: false,
  }

  // Dependency status
  private dependencies: DependencyStatus = {
    slamToolbox: false,
    exploreLite: false,
    nav2Bringup: false,
  }

  constructor(io: SocketIOServer, logger: Logger) {
    this.io = io
    this.logger = logger.child({ service: 'map-manager' })

    // Check dependencies on startup
    this.checkDependencies()
  }

  // ===========================================================================
  // Dependency Checking
  // ===========================================================================

  /**
   * Check if required ROS2 packages are installed
   * Uses Bun.spawnSync for safety (no shell injection possible)
   */
  private checkDependencies(): void {
    this.logger.info('Checking ROS2 dependencies...')

    // Check slam_toolbox
    this.dependencies.slamToolbox = this.isPackageInstalled('slam_toolbox')
    if (!this.dependencies.slamToolbox) {
      this.logger.warn(
        '⚠️  slam_toolbox not found! Install: sudo apt install ros-humble-slam-toolbox'
      )
    }

    // Check explore_lite
    this.dependencies.exploreLite = this.isPackageInstalled('explore_lite')
    if (!this.dependencies.exploreLite) {
      this.logger.warn(
        '⚠️  explore_lite not found! Install: sudo apt install ros-humble-explore-lite'
      )
    }

    // Check nav2_bringup
    this.dependencies.nav2Bringup = this.isPackageInstalled('nav2_bringup')
    if (!this.dependencies.nav2Bringup) {
      this.logger.warn(
        '⚠️  nav2_bringup not found! Install: sudo apt install ros-humble-nav2-bringup'
      )
    }

    this.logger.info(
      {
        slamToolbox: this.dependencies.slamToolbox ? '✅' : '❌',
        exploreLite: this.dependencies.exploreLite ? '✅' : '❌',
        nav2Bringup: this.dependencies.nav2Bringup ? '✅' : '❌',
      },
      'Dependency check complete'
    )
  }

  /**
   * Check if a ROS2 package is installed using Bun.spawnSync
   * Safe from shell injection as package names are hardcoded
   */
  private isPackageInstalled(packageName: string): boolean {
    // Validate package name (only alphanumeric, underscores, hyphens)
    if (!/^[a-zA-Z0-9_-]+$/.test(packageName)) {
      this.logger.error({ packageName }, 'Invalid package name')
      return false
    }

    try {
      // Use bash -c to source ROS2 (including user workspace) and run ros2 pkg list
      // Package names are validated above, so this is safe
      const result = Bun.spawnSync([
        'bash',
        '-c',
        `source /opt/ros/humble/setup.bash && source ~/ros2_ws/install/setup.bash 2>/dev/null; ros2 pkg list | grep -q "^${packageName}$"`,
      ])

      return result.exitCode === 0
    } catch {
      return false
    }
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Get current manager state
   */
  getState(): MapManagerState {
    return { ...this.state }
  }

  /**
   * Get dependency status
   */
  getDependencies(): DependencyStatus {
    return { ...this.dependencies }
  }

  /**
   * Load a saved map into Nav2 MapServer
   *
   * Process:
   * 1. Kill SLAM + Explore if running
   * 2. Export map to filesystem
   * 3. Launch nav2_map_server with map file
   */
  async loadMapToNav2(mapId: string): Promise<boolean> {
    this.logger.info({ mapId }, 'Loading map to Nav2')

    // Check nav2 dependency
    if (!this.dependencies.nav2Bringup) {
      const errorMsg = 'nav2_bringup not installed. Run: sudo apt install ros-humble-nav2-bringup'
      this.logger.error(errorMsg)
      this.broadcastMapStatus(mapId, 'error', errorMsg)
      return false
    }

    // Update state
    this.updateState({
      loadingStatus: 'loading',
      loadingError: null,
    })
    this.broadcastMapStatus(mapId, 'loading', 'Preparing to load map...')

    try {
      // 1. Get map data
      const mapData = loadMap(mapId)
      if (!mapData) {
        throw new Error(`Map not found: ${mapId}`)
      }

      // 2. Kill exploration processes if running
      await this.stopExploration()

      // 3. Kill SLAM if running
      if (this.slamProcess) {
        this.broadcastMapStatus(mapId, 'loading', 'Stopping SLAM...')
        await this.killProcess(this.slamProcess, 'slam')
        this.slamProcess = null
      }

      // 4. Kill existing MapServer if running
      if (this.mapServerProcess) {
        this.broadcastMapStatus(mapId, 'loading', 'Stopping previous MapServer...')
        await this.killProcess(this.mapServerProcess, 'map_server')
        this.mapServerProcess = null
      }

      // 5. Export map to filesystem
      this.broadcastMapStatus(mapId, 'loading', 'Exporting map files...')
      const exported = exportMapToFilesystem(mapId)
      if (!exported) {
        throw new Error('Failed to export map to filesystem')
      }

      this.logger.info({ pgmPath: exported.pgmPath, yamlPath: exported.yamlPath }, 'Map exported')

      // 6. Launch Nav2 localization (map_server + AMCL)
      this.broadcastMapStatus(mapId, 'loading', 'Starting Nav2 Localization...')

      // Ensure absolute path for map file (ROS2 launch files often fail with relative paths)
      const absoluteYamlPath = resolve(exported.yamlPath)

      // Build launch command with ROS2 sourcing
      const launchCmd = [
        ROS2_SOURCE_CMD,
        'ros2 launch nav2_bringup localization_launch.py',
        `map:=${absoluteYamlPath}`,
        USE_SIM_TIME ? 'use_sim_time:=true' : '',
      ]
        .filter(Boolean)
        .join(' ')

      this.logger.info({ launchCmd }, 'Spawning Nav2 localization process')

      try {
        this.mapServerProcess = Bun.spawn(['bash', '-c', launchCmd], {
          stdout: 'pipe',
          stderr: 'pipe',
          onExit: (_proc, exitCode) => {
            this.logger.warn({ exitCode }, 'MapServer/Localization process exited')
            if (this.state.mode === 'map_server') {
              this.updateState({ mode: 'none', loadedMapId: null, loadedMapName: null })
              this.broadcastModeChanged('none')
              this.broadcastMapStatus(
                null,
                'error',
                `Localization process exited with code ${exitCode}`
              )
            }
          },
        })

        // Log stdout/stderr for debugging
        this.pipeProcessOutput(this.mapServerProcess, 'map_server')

        // Wait a bit for process to start and check if it's still running
        await this.waitForProcessStartup(this.mapServerProcess, 'Nav2 Localization')
      } catch (spawnError) {
        const spawnErrorMsg =
          spawnError instanceof Error ? spawnError.message : 'Failed to spawn process'
        this.logger.error({ error: spawnErrorMsg }, 'Failed to spawn Nav2 localization')
        throw new Error(`Failed to start Nav2: ${spawnErrorMsg}`)
      }

      // Update state on success
      this.updateState({
        mode: 'map_server',
        loadedMapId: mapId,
        loadedMapName: mapData.name,
        loadingStatus: 'success',
        loadingError: null,
        isExploring: false,
      })

      this.broadcastMapStatus(mapId, 'success', 'Map loaded successfully')
      this.broadcastModeChanged('map_server', mapId, mapData.name)

      this.logger.info({ mapId, mapName: mapData.name }, 'Map loaded to Nav2 successfully')
      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error({ mapId, error: errorMessage }, 'Failed to load map to Nav2')

      this.updateState({
        loadingStatus: 'error',
        loadingError: errorMessage,
      })

      this.broadcastMapStatus(mapId, 'error', errorMessage)
      return false
    }
  }

  /**
   * Start SLAM Toolbox + Explore Lite for autonomous mapping
   *
   * Process:
   * 1. Kill MapServer if running
   * 2. Launch SLAM Toolbox
   * 3. Launch Explore Lite for autonomous exploration
   */
  async startSlam(): Promise<boolean> {
    this.logger.info('Starting SLAM with autonomous exploration')

    // Check dependencies
    // NOTE: websocket-server may run on a separate host than the ROS2 graph (e.g. Tinybox)
    // while slam_toolbox runs on the robot/Isaac Sim host reachable via ROSBridge.
    // If slam_toolbox isn't installed locally, don't hard-fail here — fall back to "remote SLAM"
    // mode so the UI can still drive mapping manually (and rely on already-running slam_toolbox).
    if (!this.dependencies.slamToolbox) {
      const msg =
        'slam_toolbox not installed on websocket-server host; assuming slam_toolbox is running remotely via ROSBridge'
      this.logger.warn(msg)

      this.updateState({
        mode: 'slam',
        loadedMapId: null,
        loadedMapName: null,
        loadingStatus: 'success',
        loadingError: null,
        isExploring: false,
      })

      this.broadcastMapStatus(null, 'success', 'SLAM active (remote) — manual exploration required')
      this.broadcastModeChanged('slam')
      this.broadcastMappingStatus(false)

      return true
    }

    this.updateState({
      loadingStatus: 'loading',
      loadingError: null,
    })
    this.broadcastMapStatus(null, 'loading', 'Starting SLAM...')

    try {
      // 1. Kill MapServer if running
      if (this.mapServerProcess) {
        this.broadcastMapStatus(null, 'loading', 'Stopping MapServer...')
        await this.killProcess(this.mapServerProcess, 'map_server')
        this.mapServerProcess = null
      }

      // 2. Kill existing SLAM if running (restart)
      if (this.slamProcess) {
        this.broadcastMapStatus(null, 'loading', 'Restarting SLAM...')
        await this.killProcess(this.slamProcess, 'slam')
        this.slamProcess = null
      }

      // 3. Kill existing explore if running
      await this.stopExploration()

      // 4. Launch SLAM Toolbox
      // IMPORTANT: Use ros2 run with explicit --ros-args parameters
      // The launch file fails to pass TF frame parameters correctly.
      // This exact command was verified working via SSH debugging session.
      this.broadcastMapStatus(null, 'loading', 'Starting SLAM Toolbox...')

      // Build command array with explicit parameters for Isaac Sim TF frames
      const slamCmdArgs = [
        'ros2',
        'run',
        'slam_toolbox',
        'async_slam_toolbox_node',
        '--ros-args',
        '-p',
        `use_sim_time:=${USE_SIM_TIME}`,
        '-p',
        'base_frame:=robot0/base_link', // Isaac Sim robot base frame
        '-p',
        'odom_frame:=odom', // Isaac Sim odom frame
        '-p',
        'scan_topic:=/scan', // LaserScan topic from pointcloud_to_laserscan
      ]

      // Wrap in bash with ROS2 sourcing
      const slamCmd = `${ROS2_SOURCE_CMD} ${slamCmdArgs.join(' ')}`

      this.logger.info(
        { slamCmd, slamCmdArgs },
        'Spawning SLAM Toolbox process with Isaac Sim TF frames'
      )

      try {
        this.slamProcess = Bun.spawn(['bash', '-c', slamCmd], {
          stdout: 'pipe',
          stderr: 'pipe',
          onExit: (_proc, exitCode) => {
            this.logger.warn({ exitCode }, 'SLAM process exited')
            if (this.state.mode === 'slam') {
              this.updateState({ mode: 'none', isExploring: false })
              this.broadcastModeChanged('none')
              this.broadcastMapStatus(null, 'error', `SLAM process exited with code ${exitCode}`)
            }
          },
        })

        // Log stdout/stderr for debugging
        this.pipeProcessOutput(this.slamProcess, 'slam')

        // Wait a bit for process to start and check if it's still running
        await this.waitForProcessStartup(this.slamProcess, 'SLAM Toolbox')
      } catch (spawnError) {
        const spawnErrorMsg =
          spawnError instanceof Error ? spawnError.message : 'Failed to spawn process'
        this.logger.error({ error: spawnErrorMsg }, 'Failed to spawn SLAM Toolbox')
        throw new Error(`Failed to start SLAM: ${spawnErrorMsg}`)
      }

      // 5. Launch Explore Lite (autonomous exploration)
      if (this.dependencies.exploreLite) {
        this.broadcastMapStatus(null, 'loading', 'Starting autonomous exploration...')
        await this.startExploration()
      } else {
        this.logger.warn('Explore Lite not available - SLAM started without autonomous exploration')
        this.broadcastMapStatus(
          null,
          'loading',
          'SLAM started (no explore_lite - manual drive required)'
        )
      }

      // Update state
      this.updateState({
        mode: 'slam',
        loadedMapId: null,
        loadedMapName: null,
        loadingStatus: 'success',
        loadingError: null,
        isExploring: this.dependencies.exploreLite,
      })

      // Broadcast "mapping" status for green indicator
      this.broadcastMapStatus(
        null,
        'success',
        this.state.isExploring
          ? 'Autonomous mapping active'
          : 'SLAM started - manual exploration required'
      )
      this.broadcastModeChanged('slam')
      this.broadcastMappingStatus(this.state.isExploring)

      this.logger.info(
        {
          slamPid: this.slamProcess?.pid,
          explorePid: this.exploreProcess?.pid,
          isExploring: this.state.isExploring,
        },
        'SLAM started successfully'
      )

      return true
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      this.logger.error({ error: errorMessage }, 'Failed to start SLAM')

      this.updateState({
        loadingStatus: 'error',
        loadingError: errorMessage,
      })

      this.broadcastMapStatus(null, 'error', errorMessage)
      return false
    }
  }

  /**
   * Start Explore Lite for autonomous frontier exploration
   */
  private async startExploration(): Promise<void> {
    if (!this.dependencies.exploreLite) {
      this.logger.warn('explore_lite not installed, skipping autonomous exploration')
      return
    }

    if (this.exploreProcess) {
      this.logger.info('Explore process already running')
      return
    }

    // Use custom config with robot0/base_link frame
    const exploreCmd = [
      ROS2_SOURCE_CMD,
      'ros2 run explore_lite explore',
      '--ros-args',
      '-p robot_base_frame:=robot0/base_link',
      '-p costmap_topic:=map',
      '-p visualize:=true',
      '-p planner_frequency:=0.25',
      '-p transform_tolerance:=0.5',
      '-p min_frontier_size:=0.5',
      USE_SIM_TIME ? '-p use_sim_time:=true' : '',
      '--remap /tf:=tf --remap /tf_static:=tf_static',
    ]
      .filter(Boolean)
      .join(' ')

    this.logger.info({ exploreCmd }, 'Spawning Explore Lite process')

    try {
      this.exploreProcess = Bun.spawn(['bash', '-c', exploreCmd], {
        stdout: 'pipe',
        stderr: 'pipe',
        onExit: (_proc, exitCode) => {
          this.logger.warn({ exitCode }, 'Explore Lite process exited')
          this.exploreProcess = null
          this.updateState({ isExploring: false })
          this.broadcastMappingStatus(false)

          // Only broadcast error if we're still in SLAM mode (not during intentional shutdown)
          if (this.state.mode === 'slam' && exitCode !== 0) {
            this.broadcastMapStatus(null, 'loading', `Exploration stopped (exit code: ${exitCode})`)
          }
        },
      })

      // Log stdout/stderr for debugging
      this.pipeProcessOutput(this.exploreProcess, 'explore')

      // Wait for startup
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Check if it's still running
      if (this.exploreProcess.exitCode !== null) {
        throw new Error(`Explore Lite exited with code ${this.exploreProcess.exitCode}`)
      }

      this.logger.info({ pid: this.exploreProcess.pid }, 'Explore Lite started successfully')
    } catch (error) {
      this.logger.error({ error }, 'Failed to start Explore Lite')
      this.exploreProcess = null
      // Don't throw - SLAM can continue without explore
    }
  }

  /**
   * Stop Explore Lite process
   */
  async stopExploration(): Promise<void> {
    if (this.exploreProcess) {
      this.logger.info('Stopping Explore Lite')
      await this.killProcess(this.exploreProcess, 'explore')
      this.exploreProcess = null
      this.updateState({ isExploring: false })
      this.broadcastMappingStatus(false)
    }
  }

  /**
   * Stop all processes
   */
  async stopAll(): Promise<void> {
    this.logger.info('Stopping all processes')

    // Stop explore first (gracefully)
    await this.stopExploration()

    if (this.slamProcess) {
      await this.killProcess(this.slamProcess, 'slam')
      this.slamProcess = null
    }

    if (this.mapServerProcess) {
      await this.killProcess(this.mapServerProcess, 'map_server')
      this.mapServerProcess = null
    }

    this.updateState({
      mode: 'none',
      loadedMapId: null,
      loadedMapName: null,
      loadingStatus: 'idle',
      loadingError: null,
      isExploring: false,
    })

    this.broadcastModeChanged('none')
    this.broadcastMappingStatus(false)
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  /**
   * Pipe process stdout/stderr to logger for debugging
   */
  private pipeProcessOutput(process: Subprocess, name: string): void {
    // Read stdout
    if (process.stdout && typeof process.stdout !== 'number') {
      const stdout = process.stdout
      const readStdout = async () => {
        const reader = stdout.getReader()
        const decoder = new TextDecoder()
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            // Log each line
            text
              .split('\n')
              .filter((line) => line.trim())
              .forEach((line) => {
                this.logger.debug({ process: name, stream: 'stdout' }, line)
              })
          }
        } catch {
          // Process may have been killed
        }
      }
      readStdout()
    }

    // Read stderr
    if (process.stderr && typeof process.stderr !== 'number') {
      const stderr = process.stderr
      const readStderr = async () => {
        const reader = stderr.getReader()
        const decoder = new TextDecoder()
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const text = decoder.decode(value, { stream: true })
            // Log each line (ROS2 often outputs important info to stderr)
            text
              .split('\n')
              .filter((line) => line.trim())
              .forEach((line) => {
                this.logger.info({ process: name, stream: 'stderr' }, line)
              })
          }
        } catch {
          // Process may have been killed
        }
      }
      readStderr()
    }
  }

  /**
   * Wait for process to start and verify it's running
   * Throws an error if process exits immediately
   */
  private async waitForProcessStartup(process: Subprocess, name: string): Promise<void> {
    // Wait for startup delay
    await new Promise((resolve) => setTimeout(resolve, PROCESS_STARTUP_DELAY))

    // Check if process is still running
    if (process.exitCode !== null) {
      throw new Error(`${name} process exited immediately with code ${process.exitCode}`)
    }

    this.logger.info({ name, pid: process.pid }, 'Process started successfully')
  }

  /**
   * Kill a subprocess gracefully
   */
  private async killProcess(process: Subprocess, name: string): Promise<void> {
    this.logger.info({ name, pid: process.pid }, 'Killing process')

    try {
      // Send SIGTERM for graceful shutdown
      process.kill('SIGTERM')

      // Wait for process to exit (timeout: 5 seconds)
      const exitPromise = new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          // Force kill if still running
          try {
            process.kill('SIGKILL')
          } catch {
            // Process may already be dead
          }
          resolve()
        }, 5000)

        // Check if process exited
        if (process.exitCode !== null) {
          clearTimeout(timeout)
          resolve()
        }
      })

      await exitPromise
      this.logger.info({ name }, 'Process killed')
    } catch (error) {
      this.logger.error({ name, error }, 'Failed to kill process')
    }
  }

  /**
   * Update internal state
   */
  private updateState(updates: Partial<MapManagerState>): void {
    this.state = { ...this.state, ...updates }
  }

  // ===========================================================================
  // Broadcasting
  // ===========================================================================

  private broadcastMapStatus(
    mapId: string | null,
    status: MapLoadingStatus,
    message: string
  ): void {
    this.io.emit('map_status', {
      type: 'map_status',
      timestamp: Date.now(),
      data: {
        mapId,
        status,
        message,
        error: status === 'error' ? message : undefined,
      },
    })
  }

  private broadcastModeChanged(mode: MapManagerMode, mapId?: string, mapName?: string): void {
    this.io.emit('map_mode_changed', {
      type: 'map_mode_changed',
      timestamp: Date.now(),
      data: {
        mode,
        mapId,
        mapName,
      },
    })
  }

  /**
   * Broadcast mapping status for UI green/red indicator
   */
  private broadcastMappingStatus(isMapping: boolean): void {
    this.io.emit('mapping_status', {
      type: 'mapping_status',
      timestamp: Date.now(),
      data: {
        isMapping,
        slamRunning: this.slamProcess !== null,
        exploreRunning: this.exploreProcess !== null,
      },
    })
  }
}

// =============================================================================
// Socket.IO Handler Registration
// =============================================================================

/**
 * Register Socket.IO handlers for map management
 */
export function registerMapManagerHandlers(
  _io: SocketIOServer,
  socket: Socket,
  mapManager: MapManagerService,
  logger: Logger
): void {
  const log = logger.child({ handler: 'map-manager', socketId: socket.id })

  // Load map to Nav2
  socket.on('load_map_to_nav2', async (data: unknown) => {
    log.info({ data }, 'Received load_map_to_nav2 request')

    const request = parseLoadMapToNav2Request(data)
    if (!request) {
      socket.emit('map_status', {
        type: 'map_status',
        timestamp: Date.now(),
        data: {
          mapId: null,
          status: 'error',
          error: 'Invalid request format',
        },
      })
      return
    }

    await mapManager.loadMapToNav2(request.mapId)
  })

  // Start SLAM + Exploration
  socket.on('start_slam', async () => {
    log.info('Received start_slam request')
    await mapManager.startSlam()
  })

  // Stop exploration (but keep SLAM running)
  socket.on('stop_exploration', async () => {
    log.info('Received stop_exploration request')
    await mapManager.stopExploration()
    socket.emit('map_status', {
      type: 'map_status',
      timestamp: Date.now(),
      data: {
        mapId: null,
        status: 'success',
        message: 'Exploration stopped - SLAM still running',
      },
    })
  })

  // Stop all processes
  socket.on('stop_mapping', async () => {
    log.info('Received stop_mapping request')
    await mapManager.stopAll()
  })

  // Get current mode
  socket.on('get_map_mode', () => {
    const state = mapManager.getState()
    socket.emit('map_mode_changed', {
      type: 'map_mode_changed',
      timestamp: Date.now(),
      data: {
        mode: state.mode,
        mapId: state.loadedMapId ?? undefined,
        mapName: state.loadedMapName ?? undefined,
      },
    })
    // Also send mapping status
    socket.emit('mapping_status', {
      type: 'mapping_status',
      timestamp: Date.now(),
      data: {
        isMapping: state.mode === 'slam' && state.isExploring,
        slamRunning: state.mode === 'slam',
        exploreRunning: state.isExploring,
      },
    })
  })

  // Get dependencies status
  socket.on('get_dependencies', () => {
    const deps = mapManager.getDependencies()
    socket.emit('dependencies_status', {
      type: 'dependencies_status',
      timestamp: Date.now(),
      data: deps,
    })
  })
}

// =============================================================================
// Factory
// =============================================================================

let mapManagerInstance: MapManagerService | null = null

/**
 * Returns the singleton MapManagerService instance for the current process.
 * @param io - Socket.IO server used to register map-related event handlers.
 * @param logger - Logger for map manager lifecycle and runtime diagnostics.
 * @returns MapManagerService singleton instance.
 */
export function getMapManagerService(io: SocketIOServer, logger: Logger): MapManagerService {
  if (!mapManagerInstance) {
    mapManagerInstance = new MapManagerService(io, logger)
  }
  return mapManagerInstance
}
