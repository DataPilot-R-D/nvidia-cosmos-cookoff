/**
 * CommandPalette — Ctrl+K fuzzy search for modules.
 * Type to filter, Enter to add, Escape to close.
 */
'use client'

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { getAllModuleDefinitions, type ModuleDefinition } from '@/components/widgets/ModuleRegistry'
import { useTabStore } from '@/lib/stores/tab-store'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const addWidget = useTabStore((s) => s.addWidget)
  const activeTabId = useTabStore((s) => s.activeTabId)

  const allModules = useMemo(() => {
    return getAllModuleDefinitions().filter((m) => m.type !== 'empty')
  }, [])

  const filtered = useMemo(() => {
    if (!query.trim()) return allModules
    const q = query.toLowerCase()
    return allModules.filter(
      (m) => m.label.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
    )
  }, [query, allModules])

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // Clamp selection
  useEffect(() => {
    if (selectedIndex >= filtered.length) setSelectedIndex(Math.max(0, filtered.length - 1))
  }, [filtered.length, selectedIndex])

  const handleAdd = useCallback(
    (module: ModuleDefinition) => {
      if (!activeTabId) return
      const widgetId = `${module.type}-${Date.now()}`
      addWidget(activeTabId, { id: widgetId, moduleType: module.type })
      onClose()
    },
    [addWidget, activeTabId, onClose]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault()
        handleAdd(filtered[selectedIndex])
      } else if (e.key === 'Escape') {
        onClose()
      }
    },
    [filtered, selectedIndex, handleAdd, onClose]
  )

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#111] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="command-palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10">
          <span className="text-white/30 text-sm">🔍</span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search modules..."
            className="flex-1 bg-transparent text-sm text-white placeholder-white/30 outline-none"
            data-testid="command-palette-input"
          />
          <kbd className="text-[9px] text-white/20 border border-white/10 rounded px-1 py-0.5">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-white/30">No modules found</div>
          ) : (
            filtered.map((m, i) => (
              <button
                key={m.type}
                onClick={() => handleAdd(m)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors ${
                  i === selectedIndex
                    ? 'bg-cyan-500/10 text-white'
                    : 'text-white/70 hover:bg-white/5'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium">{m.label}</div>
                  <div className="text-[10px] text-white/40 truncate">{m.description}</div>
                </div>
                {i === selectedIndex && (
                  <kbd className="text-[8px] text-white/20 border border-white/10 rounded px-1">
                    ↵
                  </kbd>
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-white/10 flex gap-3 text-[9px] text-white/20">
          <span>↑↓ navigate</span>
          <span>↵ add</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  )
}
