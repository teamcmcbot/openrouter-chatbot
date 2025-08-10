'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ClientPortalProps {
  children: React.ReactNode
  containerId?: string
}

export default function ClientPortal({ children, containerId }: ClientPortalProps) {
  const [mounted, setMounted] = useState(false)
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setMounted(true)
    if (containerId) {
      let el = document.getElementById(containerId)
      if (!el) {
        el = document.createElement('div')
        el.id = containerId
        document.body.appendChild(el)
      }
      setContainer(el)
    } else {
      setContainer(document.body)
    }
    return () => setMounted(false)
  }, [containerId])

  if (!mounted || !container) return null
  return createPortal(children, container)
}
