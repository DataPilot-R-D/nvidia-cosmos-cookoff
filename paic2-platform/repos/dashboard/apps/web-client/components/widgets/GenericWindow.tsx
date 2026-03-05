/**
 * GenericWindow Component
 *
 * Universal window that can display any registered module.
 * User can select module type from dropdown menu.
 *
 * Features:
 * - OS-like title bar with drag handle
 * - [X] Close button
 * - [v] Module selector dropdown
 * - Dynamic content based on selected module
 * - Default empty state with "Select Module" message
 *
 * @see Universal Window System Architecture
 */

'use client'

import {
  forwardRef,
  useState,
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
} from 'react'

import {
  type ModuleType,
  getModuleComponent,
  getModuleDefinition,
  getAllModuleDefinitions,
} from './ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

export interface GenericWindowProps extends HTMLAttributes<HTMLDivElement> {
  /** Unique window identifier */
  windowId: string
  /** Initial module type to display */
  initialModule?: ModuleType
  /** Callback when window is closed/hidden */
  onClose?: () => void
  /** Callback when module type changes */
  onModuleChange?: (windowId: string, moduleType: ModuleType) => void
  /** Whether window can be closed */
  closable?: boolean
  /** Additional className for grid layout integration */
  className?: string
  /** Style object for grid positioning */
  style?: CSSProperties
}

// =============================================================================
// Component
// =============================================================================

/**
 * GenericWindow - Universal window wrapper with module selector
 *
 * Integrates with React Grid Layout by:
 * - Forwarding className and style props
 * - Providing drag handle via 'widget-drag-handle' class
 * - Using forwardRef for grid item refs
 */
export const GenericWindow = forwardRef<HTMLDivElement, GenericWindowProps>(function GenericWindow(
  {
    windowId,
    initialModule = 'empty',
    onClose,
    onModuleChange,
    closable = true,
    className = '',
    style,
    ...props
  },
  ref
) {
  const [selectedModule, setSelectedModule] = useState<ModuleType>(initialModule)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Update selected module when initialModule changes
  useEffect(() => {
    setSelectedModule(initialModule)
  }, [initialModule])

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])

  // Close menu on Escape key
  useEffect(() => {
    if (!isMenuOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isMenuOpen])

  const handleModuleSelect = useCallback(
    (moduleType: ModuleType) => {
      setSelectedModule(moduleType)
      setIsMenuOpen(false)
      onModuleChange?.(windowId, moduleType)
    },
    [windowId, onModuleChange]
  )

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev)
  }, [])

  const handleClose = useCallback(() => {
    onClose?.()
  }, [onClose])

  // Get current module info
  const moduleDefinition = getModuleDefinition(selectedModule)
  const ModuleComponent = getModuleComponent(selectedModule)
  const availableModules = getAllModuleDefinitions()

  // Window title based on selected module
  const windowTitle = selectedModule === 'empty' ? 'New Window' : moduleDefinition.label

  return (
    <div
      ref={ref}
      className={`glass-window h-full w-full flex flex-col overflow-hidden ${className}`}
      style={style}
      data-testid={`generic-window-${windowId}`}
      role="region"
      aria-label={windowTitle}
      {...props}
    >
      {/* Title Bar - Darker Glass with High Contrast */}
      <div
        className="window-title-bar glass-header widget-drag-handle"
        data-testid={`window-title-bar-${windowId}`}
      >
        {/* Window Title - Pure White */}
        <span className="window-title text-white">{windowTitle}</span>

        {/* Window Controls - White Icons */}
        <div className="window-controls">
          {/* Module Selector Dropdown */}
          <div className="relative">
            <button
              ref={buttonRef}
              className="window-control-btn window-dropdown-btn text-white"
              onClick={toggleMenu}
              aria-haspopup="listbox"
              aria-expanded={isMenuOpen}
              data-testid={`window-module-btn-${windowId}`}
              title="Select Module"
            >
              <span className="window-dropdown-label">
                {selectedModule === 'empty' ? 'Select' : moduleDefinition.label}
              </span>
              <svg
                className={`window-dropdown-icon ${isMenuOpen ? 'rotate-180' : ''}`}
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

            {/* Dropdown Menu - Glass Style */}
            {isMenuOpen && (
              <div
                ref={menuRef}
                className="window-dropdown-menu glass-menu"
                role="listbox"
                data-testid={`window-module-menu-${windowId}`}
              >
                {availableModules.map((module) => (
                  <button
                    key={module.type}
                    className={`window-dropdown-item ${
                      module.type === selectedModule ? 'window-dropdown-item-active' : ''
                    }`}
                    onClick={() => handleModuleSelect(module.type)}
                    role="option"
                    aria-selected={module.type === selectedModule}
                    data-testid={`module-option-${module.type}`}
                  >
                    <span className="window-dropdown-item-label">{module.label}</span>
                    <span className="window-dropdown-item-topic">{module.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Close Button - White Icon */}
          {closable && (
            <button
              className="window-control-btn window-close-btn text-white"
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

      {/* Content Area - Lighter Glass */}
      <div className="window-content glass-body" data-testid={`window-content-${windowId}`}>
        <ModuleComponent windowId={windowId} />
      </div>
    </div>
  )
})

// Default export
export default GenericWindow
