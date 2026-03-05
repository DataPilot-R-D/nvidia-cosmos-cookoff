/**
 * AuditLogModule Component (T2.4)
 *
 * Displays append-only audit trail with filters for user, action type, and date range.
 * Registered in ModuleRegistry as 'audit-log'.
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { ModuleProps } from './ModuleRegistry'

// =============================================================================
// Types
// =============================================================================

interface AuditEntry {
  id: number
  timestamp: string
  userId: string
  userRole: string
  action: string
  params: string | null
  result: string
  reason: string | null
}

interface AuditResponse {
  entries: AuditEntry[]
  total: number
}

// =============================================================================
// Constants
// =============================================================================

const RESULT_COLORS: Record<string, string> = {
  ok: '#22c55e',
  denied: '#ef4444',
  error: '#f59e0b',
}

const PAGE_SIZE = 50

// =============================================================================
// Component
// =============================================================================

export function AuditLogModule({ windowId }: ModuleProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterUserId, setFilterUserId] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [page, setPage] = useState(0)

  const abortRef = useRef<AbortController | null>(null)

  const fetchAudit = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (filterUserId) params.set('userId', filterUserId)
    if (filterAction) params.set('action', filterAction)
    if (filterDateFrom) params.set('dateFrom', new Date(filterDateFrom).toISOString())
    if (filterDateTo) params.set('dateTo', new Date(filterDateTo).toISOString())
    params.set('limit', String(PAGE_SIZE))
    params.set('offset', String(page * PAGE_SIZE))

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:8081'
    const baseUrl = wsUrl.replace(/^ws/, 'http')

    try {
      const res = await fetch(`${baseUrl}/api/audit?${params}`, { signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AuditResponse = await res.json()
      setEntries(data.entries)
      setTotal(data.total)
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      setError(e instanceof Error ? e.message : 'Failed to fetch')
    } finally {
      setLoading(false)
    }
  }, [filterUserId, filterAction, filterDateFrom, filterDateTo, page])

  useEffect(() => {
    fetchAudit()
    return () => abortRef.current?.abort()
  }, [fetchAudit])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div
      className="h-full flex flex-col text-[11px] font-mono"
      data-testid={`module-audit-log-${windowId}`}
    >
      {/* Filters bar */}
      <div className="flex flex-wrap gap-2 p-2 border-b border-[#222]">
        <input
          type="text"
          placeholder="User ID"
          value={filterUserId}
          onChange={(e) => {
            setFilterUserId(e.target.value)
            setPage(0)
          }}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] w-24 text-white"
        />
        <input
          type="text"
          placeholder="Action"
          value={filterAction}
          onChange={(e) => {
            setFilterAction(e.target.value)
            setPage(0)
          }}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] w-24 text-white"
        />
        <input
          type="date"
          value={filterDateFrom}
          onChange={(e) => {
            setFilterDateFrom(e.target.value)
            setPage(0)
          }}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] text-white"
          title="From date"
        />
        <input
          type="date"
          value={filterDateTo}
          onChange={(e) => {
            setFilterDateTo(e.target.value)
            setPage(0)
          }}
          className="bg-[#111] border border-[#333] rounded px-2 py-1 text-[10px] text-white"
          title="To date"
        />
        <button
          onClick={fetchAudit}
          className="bg-[#222] border border-[#444] rounded px-2 py-1 text-[10px] text-[#888] hover:text-white"
        >
          ↻
        </button>
        <span className="text-[#555] self-center ml-auto">{total} entries</span>
      </div>

      {/* Error */}
      {error && <div className="px-2 py-1 text-red-400 text-[10px]">Error: {error}</div>}

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left">
          <thead className="sticky top-0 bg-[#0a0a0a]">
            <tr className="text-[9px] text-[#666] uppercase tracking-wider">
              <th className="px-2 py-1">Time</th>
              <th className="px-2 py-1">User</th>
              <th className="px-2 py-1">Role</th>
              <th className="px-2 py-1">Action</th>
              <th className="px-2 py-1">Result</th>
              <th className="px-2 py-1">Reason</th>
            </tr>
          </thead>
          <tbody>
            {loading && entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-[#555]">
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-2 py-4 text-center text-[#555]">
                  No audit entries
                </td>
              </tr>
            ) : (
              entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[#1a1a1a] hover:bg-[#111]">
                  <td className="px-2 py-1 text-[#888] whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-2 py-1 text-[#aaa]">{entry.userId}</td>
                  <td className="px-2 py-1 text-[#666]">{entry.userRole}</td>
                  <td className="px-2 py-1 text-white">{entry.action}</td>
                  <td className="px-2 py-1">
                    <span
                      className="px-1 py-0.5 rounded text-[9px] uppercase font-medium"
                      style={{
                        color: RESULT_COLORS[entry.result] ?? '#888',
                        borderColor: RESULT_COLORS[entry.result] ?? '#333',
                        borderWidth: '1px',
                      }}
                    >
                      {entry.result}
                    </span>
                  </td>
                  <td
                    className="px-2 py-1 text-[#666] truncate max-w-[200px]"
                    title={entry.reason ?? ''}
                  >
                    {entry.reason ?? '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 py-1 border-t border-[#222] text-[10px] text-[#666]">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="disabled:opacity-30"
          >
            ← Prev
          </button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  )
}

export default AuditLogModule
