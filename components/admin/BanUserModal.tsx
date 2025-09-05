'use client'

import React, { useEffect, useMemo, useState } from 'react'
import ConfirmModal from '../ui/ConfirmModal'

interface BanUserModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (payload: { until: string | null; reason: string }) => void
}

// Minimal modal to collect ban type and reason.
// - Permanent ban OR temporary ban for N hours
// - Reason is required (>= 3 chars)
export default function BanUserModal({ isOpen, onClose, onConfirm }: Readonly<BanUserModalProps>) {
  const MAX_BAN_HOURS = 24 * 365 * 5; // ~5 years
  const [mode, setMode] = useState<'perm' | 'hours'>('hours')
  const [hours, setHours] = useState<string>('24')
  const [reason, setReason] = useState<string>('')

  useEffect(() => {
    if (!isOpen) {
      // Reset when closed
      setMode('hours')
      setHours('24')
      setReason('')
    }
  }, [isOpen])

  const validHours = useMemo(() => {
    if (mode !== 'hours') return true
    const n = parseInt(hours, 10)
  return Number.isFinite(n) && n > 0 && n <= MAX_BAN_HOURS // cap at ~5y
  }, [mode, hours, MAX_BAN_HOURS])

  const isValid = useMemo(() => {
    const reasonOk = reason.trim().length >= 3
    return reasonOk && validHours
  }, [reason, validHours])

  const handleConfirm = () => {
    if (!isValid) return
    let until: string | null = null
    if (mode === 'hours') {
      const n = parseInt(hours, 10)
      until = new Date(Date.now() + n * 3600 * 1000).toISOString()
    }
    onConfirm({ until, reason: reason.trim() })
  }

  return (
    <ConfirmModal
      isOpen={isOpen}
      title="Ban user"
      description="Select ban type and provide a reason."
      confirmText="Ban"
      cancelText="Cancel"
      onCancel={onClose}
      onConfirm={handleConfirm}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ban-mode"
              className="accent-red-600"
              checked={mode === 'perm'}
              onChange={() => setMode('perm')}
            />
            Permanent
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="ban-mode"
              className="accent-red-600"
              checked={mode === 'hours'}
              onChange={() => setMode('hours')}
            />
            Temporary
            <input
              type="number"
              min={1}
              className="ml-2 border rounded px-2 py-1 text-sm w-24 input-emerald-focus"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              disabled={mode !== 'hours'}
            />
            <span className="text-xs text-gray-600">hours</span>
          </label>
          {!validHours && (
            <div className="text-xs text-red-600">Enter a valid number of hours (1+)</div>
          )}
        </div>

        <div>
          <label className="block text-sm mb-1">Reason</label>
          <textarea
            className="w-full border rounded px-2 py-1 text-sm input-emerald-focus"
            rows={3}
            placeholder="Reason for ban (min 3 characters)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {reason.trim().length < 3 && (
            <div className="text-xs text-red-600 mt-1">Reason is required.</div>
          )}
        </div>

        <div className="text-xs text-gray-500">
          Note: This action takes effect immediately and will invalidate the user&#39;s auth snapshot cache.
        </div>
      </div>
    </ConfirmModal>
  )
}
