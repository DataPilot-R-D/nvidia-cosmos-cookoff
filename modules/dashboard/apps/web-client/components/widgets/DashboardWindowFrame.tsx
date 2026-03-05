/**
 * DashboardWindowFrame Component
 *
 * OS-like window wrapper for dashboard widgets.
 * Provides title bar with controls like a desktop operating system.
 *
 * Design References (Pencil):
 * - Thin 1px borders: #555555
 * - Dark background: #2A2A2A
 * - Accent: #8B6F47
 * - Technical, minimal aesthetic
 *
 * Features:
 * - Title bar with drag handle
 * - [X] Close/hide button
 * - [v] Dropdown for ROS topic selection
 *
 * @see plan.md Step 5: OS-like Window System
 */

'use client'

import {
  forwardRef,
  useState,
  useCallback,
  type ReactNode,
  type CSSProperties,
  type HTMLAttributes,
} from 'react'

// =============================================================================
// Types
// =============================================================================

export interface RosTopicOption {
  id: string
  label: string
  topic: string
}

export interface DashboardWindowFrameProps extends HTMLAttributes<HTMLDivElement> {
  /** Window title displayed in title bar */
  title: string
  /** Unique window identifier */
  windowId: string
  /** Window content */
  children: ReactNode
  /** Additional className for grid layout integration */
  className?: string
  /** Style object for grid positioning */
  style?: CSSProperties
  /** Available ROS topics for dropdown */
  rosTopics?: RosTopicOption[]
  /** Currently selected ROS topic */
  selectedTopic?: string
  /** Callback when topic is selected */
  onTopicSelect?: (topicId: string) => void
  /** Callback when window is closed/hidden */
  onClose?: () => void
  /** Whether window can be closed */
  closable?: boolean
  /** Whether to show ROS topic dropdown */
  showTopicSelector?: boolean
  /** Whether window is currently hidden */
  isHidden?: boolean
}

// =============================================================================
// Component
// =============================================================================

/**
 * DashboardWindowFrame - OS-like window wrapper for widgets
 *
 * Integrates with React Grid Layout by:
 * - Forwarding className and style props
 * - Providing drag handle via 'widget-drag-handle' class
 * - Using forwardRef for grid item refs
 */
export const DashboardWindowFrame = forwardRef<HTMLDivElement, DashboardWindowFrameProps>(
  function DashboardWindowFrame(
    {
      title,
      windowId,
      children,
      className = '',
      style,
      rosTopics = [],
      selectedTopic,
      onTopicSelect,
      onClose,
      closable = true,
      showTopicSelector = true,
      isHidden = false,
      ...props
    },
    ref
  ) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)

    const handleTopicSelect = useCallback(
      (topicId: string) => {
        onTopicSelect?.(topicId)
        setIsDropdownOpen(false)
      },
      [onTopicSelect]
    )

    const toggleDropdown = useCallback(() => {
      setIsDropdownOpen((prev) => !prev)
    }, [])

    const handleClose = useCallback(() => {
      onClose?.()
    }, [onClose])

    // Don't render if hidden
    if (isHidden) {
      return null
    }

    const selectedTopicLabel =
      rosTopics.find((t) => t.id === selectedTopic)?.label || 'Select Topic'

    return (
      <div
        ref={ref}
        className={`window-frame h-full w-full flex flex-col overflow-hidden ${className}`}
        style={style}
        data-testid={`window-${windowId}`}
        role="region"
        aria-label={title}
        {...props}
      >
        {/* Title Bar - OS-like header */}
        <div
          className="window-title-bar widget-drag-handle"
          data-testid={`window-title-bar-${windowId}`}
        >
          {/* Window Title */}
          <span className="window-title">{title}</span>

          {/* Window Controls - Right side */}
          <div className="window-controls">
            {/* ROS Topic Dropdown */}
            {showTopicSelector && rosTopics.length > 0 && (
              <div className="relative">
                <button
                  className="window-control-btn window-dropdown-btn"
                  onClick={toggleDropdown}
                  aria-haspopup="listbox"
                  aria-expanded={isDropdownOpen}
                  data-testid={`window-topic-btn-${windowId}`}
                  title="Select ROS Topic"
                >
                  <span className="window-dropdown-label">{selectedTopicLabel}</span>
                  <svg
                    className={`window-dropdown-icon ${isDropdownOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 10 6"
                    fill="none"
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div
                    className="window-dropdown-menu"
                    role="listbox"
                    data-testid={`window-dropdown-${windowId}`}
                  >
                    {rosTopics.map((topic) => (
                      <button
                        key={topic.id}
                        className={`window-dropdown-item ${
                          topic.id === selectedTopic ? 'window-dropdown-item-active' : ''
                        }`}
                        onClick={() => handleTopicSelect(topic.id)}
                        role="option"
                        aria-selected={topic.id === selectedTopic}
                      >
                        <span className="window-dropdown-item-label">{topic.label}</span>
                        <span className="window-dropdown-item-topic">{topic.topic}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Close Button */}
            {closable && (
              <button
                className="window-control-btn window-close-btn"
                onClick={handleClose}
                aria-label="Close window"
                data-testid={`window-close-${windowId}`}
                title="Close"
              >
                <svg viewBox="0 0 10 10" fill="none" className="window-close-icon">
                  <path
                    d="M1 1L9 9M9 1L1 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="window-content" data-testid={`window-content-${windowId}`}>
          {children}
        </div>
      </div>
    )
  }
)

// Default export
export default DashboardWindowFrame
