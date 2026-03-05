/**
 * ModuleErrorBoundary — catches errors per module,
 * prevents one crashed module from taking down the dashboard.
 */
'use client'

import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { useNotificationStore } from '@/lib/stores/notification-store'

interface Props {
  children: ReactNode
  moduleId?: string
  moduleName?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ModuleErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const name = this.props.moduleName ?? this.props.moduleId ?? 'unknown'
    // Log to console for debugging
    console.error(`[ModuleErrorBoundary] ${name} crashed:`, error, errorInfo)
    // Send to notification store
    try {
      useNotificationStore.getState().add('error', `${name} crashed`, error.message, 'system')
    } catch {
      // Store may not be available during SSR
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-4 bg-[#0d0f11]">
          <div className="text-center max-w-xs">
            <div className="text-2xl mb-2">💥</div>
            <div className="text-xs font-medium text-white/70 mb-1">
              {this.props.moduleName ?? 'Module'} crashed
            </div>
            <div className="text-[10px] text-white/30 mb-3 break-all">
              {this.state.error?.message?.slice(0, 100) ?? 'Unknown error'}
            </div>
            <button
              onClick={this.handleRetry}
              className="px-3 py-1 text-[10px] bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-300 rounded transition-colors"
            >
              🔄 Retry
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
