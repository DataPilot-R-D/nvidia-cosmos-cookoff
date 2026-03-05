/**
 * SidebarTabs Component
 *
 * Dynamic tab system for the sidebar with Liquid Glass styling.
 * Features:
 * - Tab list with active highlighting
 * - CRUD operations (Add, Rename, Delete)
 * - Keyboard navigation
 * - ARIA accessibility
 *
 * @see High-Contrast Liquid Glass Design System
 */

'use client'

import { type ReactNode, useState, useCallback, useRef, useEffect, type KeyboardEvent } from 'react'

import { useTabStore } from '@/lib/stores'

// =============================================================================
// Types
// =============================================================================

export interface SidebarTabsProps {
  /** Optional callback when tab is switched */
  onTabChange?: (tabId: string) => void
}

// =============================================================================
// Component
// =============================================================================

export function SidebarTabs({ onTabChange }: SidebarTabsProps): ReactNode {
  // Store selectors
  const tabs = useTabStore((state) => state.tabs)
  const activeTabId = useTabStore((state) => state.activeTabId)
  const addTab = useTabStore((state) => state.addTab)
  const renameTab = useTabStore((state) => state.renameTab)
  const switchTab = useTabStore((state) => state.switchTab)
  const deleteTab = useTabStore((state) => state.deleteTab)

  // Local state for editing
  const [editingTabId, setEditingTabId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup blur timeout on unmount
  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editingTabId])

  // Handle tab click
  const handleTabClick = useCallback(
    (tabId: string) => {
      if (editingTabId) return // Don't switch while editing

      switchTab(tabId)
      onTabChange?.(tabId)
    },
    [switchTab, onTabChange, editingTabId]
  )

  // Handle add tab
  const handleAddTab = useCallback(() => {
    addTab()
  }, [addTab])

  // Start editing
  const handleStartEdit = useCallback((tabId: string, currentName: string) => {
    setEditingTabId(tabId)
    setEditValue(currentName)
  }, [])

  // Handle double-click to edit
  const handleDoubleClick = useCallback(
    (tabId: string, currentName: string) => {
      handleStartEdit(tabId, currentName)
    },
    [handleStartEdit]
  )

  // Save edit
  const handleSaveEdit = useCallback(() => {
    if (editingTabId && editValue.trim()) {
      renameTab(editingTabId, editValue)
    }
    setEditingTabId(null)
    setEditValue('')
  }, [editingTabId, editValue, renameTab])

  // Cancel edit
  const handleCancelEdit = useCallback(() => {
    setEditingTabId(null)
    setEditValue('')
  }, [])

  // Handle input key events
  const handleInputKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSaveEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        handleCancelEdit()
      }
    },
    [handleSaveEdit, handleCancelEdit]
  )

  // Handle input blur
  const handleInputBlur = useCallback(() => {
    // Clear any existing timeout
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
    }
    // Small delay to allow click events to fire first
    blurTimeoutRef.current = setTimeout(() => {
      if (editingTabId) {
        handleSaveEdit()
      }
    }, 100)
  }, [editingTabId, handleSaveEdit])

  // Keyboard navigation for tab list (WCAG compliance)
  const handleTabListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (tabs.length === 0 || editingTabId) return

      const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
      if (currentIndex === -1) return

      let nextIndex: number | null = null

      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault()
        nextIndex = (currentIndex + 1) % tabs.length
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault()
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
      } else if (e.key === 'Home') {
        e.preventDefault()
        nextIndex = 0
      } else if (e.key === 'End') {
        e.preventDefault()
        nextIndex = tabs.length - 1
      }

      if (nextIndex !== null) {
        const nextTab = tabs[nextIndex]
        switchTab(nextTab.id)
        onTabChange?.(nextTab.id)
        // Focus the tab element
        const tabElement = tabRefs.current.get(nextTab.id)
        tabElement?.focus()
      }
    },
    [tabs, activeTabId, editingTabId, switchTab, onTabChange]
  )

  // Handle delete
  const handleDelete = useCallback(
    (tabId: string, e: React.MouseEvent) => {
      e.stopPropagation() // Prevent tab switch
      deleteTab(tabId)
    },
    [deleteTab]
  )

  // Handle edit button click
  const handleEditClick = useCallback(
    (tabId: string, currentName: string, e: React.MouseEvent) => {
      e.stopPropagation() // Prevent tab switch
      handleStartEdit(tabId, currentName)
    },
    [handleStartEdit]
  )

  // Empty state
  const isEmpty = tabs.length === 0

  return (
    <div className="sidebar-tabs glass-dark" data-testid="sidebar-tabs">
      {/* Tab List */}
      <div
        ref={tabListRef}
        className="tab-list"
        role="tablist"
        aria-label="Widoki dashboardu"
        onKeyDown={handleTabListKeyDown}
      >
        {isEmpty ? (
          <div className="empty-state text-white/60 text-sm p-4 text-center">Brak zakładek</div>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            const isEditing = tab.id === editingTabId

            return (
              <div
                key={tab.id}
                ref={(el) => {
                  if (el) {
                    tabRefs.current.set(tab.id, el)
                  } else {
                    tabRefs.current.delete(tab.id)
                  }
                }}
                className={`tab-item ${isActive ? 'tab-active' : ''}`}
                role="tab"
                id={`tab-${tab.id}`}
                aria-controls={`tabpanel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                aria-selected={isActive}
                data-testid={`tab-item-${tab.id}`}
                onClick={() => handleTabClick(tab.id)}
              >
                {/* Tab Name or Edit Input */}
                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    className="tab-name-input"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    onBlur={handleInputBlur}
                    data-testid={`tab-name-input-${tab.id}`}
                    maxLength={50}
                  />
                ) : (
                  <span
                    className="tab-name text-white"
                    onDoubleClick={() => handleDoubleClick(tab.id, tab.name)}
                  >
                    {tab.name}
                  </span>
                )}

                {/* Tab Actions */}
                <div className="tab-actions">
                  {/* Edit Button */}
                  <button
                    className="tab-action-btn"
                    onClick={(e) => handleEditClick(tab.id, tab.name, e)}
                    aria-label="Edytuj nazwę"
                    data-testid={`edit-tab-btn-${tab.id}`}
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  {/* Delete Button */}
                  <button
                    className="tab-action-btn tab-delete-btn"
                    onClick={(e) => handleDelete(tab.id, e)}
                    aria-label="Usuń zakładkę"
                    data-testid={`delete-tab-btn-${tab.id}`}
                  >
                    <svg
                      className="w-3 h-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Add Tab Button */}
      <button
        className="add-tab-btn"
        onClick={handleAddTab}
        aria-label="Dodaj zakładkę"
        data-testid="add-tab-btn"
      >
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span className="text-sm">Dodaj zakładkę</span>
      </button>
    </div>
  )
}

export default SidebarTabs
