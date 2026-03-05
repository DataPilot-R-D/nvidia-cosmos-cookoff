/**
 * HelpOverlay — modal listing all keyboard shortcuts.
 */
'use client'

import React from 'react'

interface HelpOverlayProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { keys: '?', description: 'Show this help' },
  { keys: 'Ctrl+K', description: 'Open command palette' },
  { keys: 'Escape', description: 'Close panels/overlays' },
  { keys: 'N', description: 'Add new module' },
  { keys: '1-9', description: 'Switch to tab 1-9' },
  { keys: 'Space', description: 'Play/pause (Replay module)' },
  { keys: '← →', description: '±5s seek (Replay module)' },
]

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#111] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        data-testid="help-overlay"
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-sm font-medium text-white">⌨️ Keyboard Shortcuts</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-sm">
            ✕
          </button>
        </div>
        <div className="px-4 py-3 space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between">
              <span className="text-xs text-white/60">{s.description}</span>
              <kbd className="text-[10px] text-cyan-300 bg-white/5 border border-white/10 rounded px-2 py-0.5 font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/10 text-center">
          <span className="text-[9px] text-white/20">Press ? or Escape to close</span>
        </div>
      </div>
    </div>
  )
}
