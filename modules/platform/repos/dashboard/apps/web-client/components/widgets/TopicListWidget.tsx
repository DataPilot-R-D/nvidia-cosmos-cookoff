/**
 * TopicListWidget Component
 *
 * ROS Topic Inspector widget for discovering and visualizing topics.
 * Displays available topics from ROSBridge with smart routing to appropriate visualizers.
 *
 * @see Topic Discovery & Visualization Feature
 */

'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useTopicStore, type RosTopic } from '@/lib/stores/topic-store'
import { useWebSocketStore } from '@/lib/stores/websocket-store'
import { usePanelRoutingStore } from '@/lib/stores/panel-routing-store'
import {
  getTopicCategory,
  getTopicColor,
  getTopicIcon,
  getShortTypeName,
  getTopicTags,
} from '@/lib/ros'
import { getHostname } from '@/lib/utils/get-hostname'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// Sub-Components
// =============================================================================

/**
 * Search/filter input
 */
function SearchInput({
  value,
  onChange,
  onClear,
}: {
  value: string
  onChange: (value: string) => void
  onClear: () => void
}) {
  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter topics..."
        className="
          w-full px-3 py-1.5 pr-8
          bg-[#1a1a1a] border border-[#333333] rounded
          text-[11px] text-[#cccccc] font-mono
          placeholder-[#555555]
          focus:outline-none focus:border-[#00ffff]/50
          transition-colors duration-150
        "
      />
      {value && (
        <button
          onClick={onClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#555555] hover:text-[#888888]"
        >
          <span className="text-xs">x</span>
        </button>
      )}
    </div>
  )
}

/**
 * Stats bar showing topic counts
 */
function StatsBar({
  total,
  filtered,
  subscribed,
  loading,
}: {
  total: number
  filtered: number
  subscribed: number
  loading: boolean
}) {
  return (
    <div className="flex items-center justify-between text-[10px] font-mono">
      <div className="flex items-center gap-3">
        <span className="text-[#666666]">TOPICS</span>
        <span className="text-[#00ffff]">{filtered}</span>
        {filtered !== total && <span className="text-[#555555]">/ {total}</span>}
      </div>
      <div className="flex items-center gap-3">
        {subscribed > 0 && (
          <span className="text-[#00ff00]">
            {subscribed} <span className="text-[#555555]">subscribed</span>
          </span>
        )}
        {loading && <span className="text-[#ffff00] animate-pulse">Loading...</span>}
      </div>
    </div>
  )
}

/**
 * Single topic row
 */
function TopicRow({
  topic,
  onVisualize,
  onToggleSubscription,
}: {
  topic: RosTopic
  onVisualize: (topic: RosTopic) => void
  onToggleSubscription: (topic: RosTopic) => void
}) {
  const category = getTopicCategory(topic.type)
  const canVisualize = category?.targetModule !== null

  return (
    <div
      className={`
        group flex items-center gap-2 px-2 py-1.5 rounded
        bg-[#1a1a1a]/50 hover:bg-[#1a1a1a]
        border border-transparent hover:border-[#333333]
        transition-all duration-100
        ${topic.subscribed ? 'border-[#00ffff]/30' : ''}
      `}
    >
      {/* Icon */}
      <span
        className="w-5 h-5 flex items-center justify-center text-[10px] font-mono rounded"
        style={{
          color: getTopicColor(topic.type),
          backgroundColor: `${getTopicColor(topic.type)}15`,
        }}
      >
        {getTopicIcon(topic.type)}
      </span>

      {/* Topic Name + Tags */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="text-[11px] text-[#cccccc] font-mono truncate" title={topic.name}>
            {topic.name}
          </div>

          {/* Tags */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {getTopicTags(topic.name, topic.type).map((tag) => (
              <span
                key={tag.label}
                className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide"
                style={{
                  color: tag.color,
                  backgroundColor: `${tag.color}20`,
                  border: `1px solid ${tag.color}40`,
                }}
                title={`Tag: ${tag.label}`}
              >
                {tag.label}
              </span>
            ))}
          </div>
        </div>

        <div className="text-[9px] text-[#555555] font-mono truncate" title={topic.type}>
          {getShortTypeName(topic.type)}
        </div>
      </div>

      {/* Message rate */}
      <div className="w-14 text-right">
        <span className="text-[9px] font-mono text-[#777777]">
          {typeof topic.messageRate === 'number' && isFinite(topic.messageRate)
            ? `${topic.messageRate.toFixed(1)} Hz`
            : '--'}
        </span>
      </div>

      {/* Subscription indicator */}
      {topic.subscribed && <span className="w-1.5 h-1.5 rounded-full bg-[#00ff00] animate-pulse" />}

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Subscribe toggle */}
        <button
          onClick={() => onToggleSubscription(topic)}
          className={`
            px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider
            transition-colors duration-100
            ${
              topic.subscribed
                ? 'bg-[#00ff00]/20 text-[#00ff00] hover:bg-[#ff0000]/20 hover:text-[#ff0000]'
                : 'bg-[#333333] text-[#888888] hover:bg-[#00ff00]/20 hover:text-[#00ff00]'
            }
          `}
          title={topic.subscribed ? 'Unsubscribe' : 'Subscribe'}
        >
          {topic.subscribed ? 'Unsub' : 'Sub'}
        </button>

        {/* Visualize button */}
        {canVisualize && (
          <button
            onClick={() => onVisualize(topic)}
            className="
              px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider
              bg-[#00ffff]/20 text-[#00ffff]
              hover:bg-[#00ffff]/30
              transition-colors duration-100
            "
            title={`Visualize in ${category?.name} module`}
          >
            View
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Topic list with virtualization hint
 */
function TopicList({
  topics,
  onVisualize,
  onToggleSubscription,
}: {
  topics: RosTopic[]
  onVisualize: (topic: RosTopic) => void
  onToggleSubscription: (topic: RosTopic) => void
}) {
  if (topics.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <span className="text-[10px] text-[#555555] uppercase tracking-wider block">
            No topics found
          </span>
          <span className="text-[9px] text-[#444444] mt-1 block">
            Connect to ROSBridge to discover topics
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
      {topics.map((topic) => (
        <TopicRow
          key={topic.name}
          topic={topic}
          onVisualize={onVisualize}
          onToggleSubscription={onToggleSubscription}
        />
      ))}
    </div>
  )
}

/**
 * Connection controls
 */
function ConnectionControls({
  isConnected,
  rosbridgeUrl,
  onRefresh,
  onUrlChange,
  loading,
}: {
  isConnected: boolean
  rosbridgeUrl: string
  onRefresh: () => void
  onUrlChange: (url: string) => void
  loading: boolean
}) {
  const [editingUrl, setEditingUrl] = useState(false)
  const [localUrl, setLocalUrl] = useState(rosbridgeUrl)

  useEffect(() => {
    setLocalUrl(rosbridgeUrl)
  }, [rosbridgeUrl])

  const handleSubmit = () => {
    if (localUrl && localUrl !== rosbridgeUrl) {
      onUrlChange(localUrl)
    }
    setEditingUrl(false)
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Status row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#00ff00]' : 'bg-[#ff0000]'}`}
          />
          <span className="text-[10px] text-[#888888] font-mono uppercase">
            {isConnected ? 'ROS Connected' : 'Disconnected'}
          </span>
        </div>
        <button
          onClick={onRefresh}
          disabled={!isConnected || loading}
          className={`
            px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider
            transition-colors duration-100
            ${
              isConnected && !loading
                ? 'bg-[#00ffff]/20 text-[#00ffff] hover:bg-[#00ffff]/30'
                : 'bg-[#333333] text-[#555555] cursor-not-allowed'
            }
          `}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      {/* URL input */}
      {editingUrl ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            onBlur={handleSubmit}
            autoFocus
            className="
              flex-1 px-2 py-1
              bg-[#1a1a1a] border border-[#00ffff]/50 rounded
              text-[10px] text-[#cccccc] font-mono
              focus:outline-none
            "
            placeholder="ws://<robot-ip>:9090"
          />
        </div>
      ) : (
        <button
          onClick={() => setEditingUrl(true)}
          className="
            text-left px-2 py-1 rounded
            bg-[#1a1a1a]/50 border border-[#333333]
            text-[10px] text-[#666666] font-mono
            hover:border-[#555555] hover:text-[#888888]
            transition-colors duration-100 truncate
          "
          title="Click to edit WebSocket URL"
        >
          {rosbridgeUrl || `ws://${getHostname()}:9090`}
        </button>
      )}
    </div>
  )
}

/**
 * Error display
 */
function ErrorDisplay({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-[#ff0000]/10 border border-[#ff0000]/30">
      <span className="text-[10px] text-[#ff0000] flex-1">{error}</span>
      <button onClick={onDismiss} className="text-[#ff0000] hover:text-[#ff6666] text-xs">
        x
      </button>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function TopicListWidget({ windowId }: ModuleProps) {
  // Store state
  const topics = useTopicStore((state) => state.topics)
  const subscriptions = useTopicStore((state) => state.subscriptions)
  const loading = useTopicStore((state) => state.loading)
  const error = useTopicStore((state) => state.error)
  const filterQuery = useTopicStore((state) => state.filterQuery)

  const setFilterQuery = useTopicStore((state) => state.setFilterQuery)
  const setError = useTopicStore((state) => state.setError)
  const addSubscription = useTopicStore((state) => state.addSubscription)
  const removeSubscription = useTopicStore((state) => state.removeSubscription)
  const setLoading = useTopicStore((state) => state.setLoading)

  const rosbridgeUrl = useWebSocketStore((state) => state.rosbridgeUrl)
  const rosbridgeConnected = useWebSocketStore((state) => state.rosbridgeConnected)
  const socket = useWebSocketStore((state) => state.socket)
  const changeRosbridgeUrl = useWebSocketStore((state) => state.changeRosbridgeUrl)

  // Filtered topics
  const filteredTopics = useMemo(() => {
    if (!filterQuery.trim()) {
      return topics
    }
    const query = filterQuery.toLowerCase()
    return topics.filter(
      (topic) =>
        topic.name.toLowerCase().includes(query) || topic.type.toLowerCase().includes(query)
    )
  }, [topics, filterQuery])

  // Request topics on mount if connected
  useEffect(() => {
    if (rosbridgeConnected && socket && topics.length === 0) {
      setLoading(true)
      socket.emit('request_ros_topics')
    }
  }, [rosbridgeConnected, socket, topics.length, setLoading])

  // Auto-refresh topic list every few seconds (new/vanishing topics)
  useEffect(() => {
    if (!rosbridgeConnected || !socket) return

    const interval = setInterval(() => {
      socket.emit('request_ros_topics')
    }, 5000)

    return () => clearInterval(interval)
  }, [rosbridgeConnected, socket])

  // Handlers
  const handleRefresh = useCallback(() => {
    if (socket && rosbridgeConnected) {
      setLoading(true)
      socket.emit('request_ros_topics')
    }
  }, [socket, rosbridgeConnected, setLoading])

  // Panel routing action
  const visualizeTopic = usePanelRoutingStore((state) => state.visualizeTopic)

  const handleVisualize = useCallback(
    (topic: RosTopic) => {
      const category = getTopicCategory(topic.type)
      if (category?.targetModule) {
        // Subscribe to topic first
        if (!subscriptions.has(topic.name) && socket) {
          socket.emit('ros_subscribe', { topic: topic.name, type: topic.type })
          addSubscription(topic.name)
        }

        // Route topic to appropriate panel via store
        visualizeTopic(topic.name, topic.type)
      }
    },
    [socket, subscriptions, addSubscription, visualizeTopic]
  )

  const handleToggleSubscription = useCallback(
    (topic: RosTopic) => {
      if (!socket) return

      if (subscriptions.has(topic.name)) {
        socket.emit('ros_unsubscribe', { topic: topic.name })
        removeSubscription(topic.name)
      } else {
        socket.emit('ros_subscribe', { topic: topic.name, type: topic.type })
        addSubscription(topic.name)
      }
    },
    [socket, subscriptions, addSubscription, removeSubscription]
  )

  const handleUrlChange = useCallback(
    (url: string) => {
      changeRosbridgeUrl(url)
    },
    [changeRosbridgeUrl]
  )

  return (
    <div
      className="h-full w-full flex flex-col bg-[#0a0a0a] p-3 gap-3"
      data-testid={`module-topic-list-${windowId}`}
    >
      {/* Connection Controls */}
      <ConnectionControls
        isConnected={rosbridgeConnected}
        rosbridgeUrl={rosbridgeUrl}
        onRefresh={handleRefresh}
        onUrlChange={handleUrlChange}
        loading={loading}
      />

      {/* Error Display */}
      {error && <ErrorDisplay error={error} onDismiss={() => setError(null)} />}

      {/* Stats Bar */}
      <StatsBar
        total={topics.length}
        filtered={filteredTopics.length}
        subscribed={subscriptions.size}
        loading={loading}
      />

      {/* Search Input */}
      <SearchInput
        value={filterQuery}
        onChange={setFilterQuery}
        onClear={() => setFilterQuery('')}
      />

      {/* Topic List */}
      <TopicList
        topics={filteredTopics}
        onVisualize={handleVisualize}
        onToggleSubscription={handleToggleSubscription}
      />
    </div>
  )
}

export default TopicListWidget
