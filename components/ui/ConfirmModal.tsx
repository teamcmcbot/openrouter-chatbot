'use client'

import { XMarkIcon } from '@heroicons/react/24/outline'
import Button from './Button'
import { ReactNode } from 'react'

interface ConfirmModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

export default function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  children
}: Readonly<ConfirmModalProps>) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white dark:bg-gray-800 text-black dark:text-white rounded-lg shadow-xl w-full max-w-sm mx-auto p-6">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold mb-2 text-center">{title}</h2>
        {description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 text-center">
            {description}
          </p>
        )}
        {children}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            {cancelText}
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
