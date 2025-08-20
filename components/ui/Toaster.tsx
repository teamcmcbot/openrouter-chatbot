'use client'

import { Toaster as HotToaster } from 'react-hot-toast'
import { useEffect, useState } from 'react'

export default function Toaster() {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [containerTop, setContainerTop] = useState<number | null>(null)
  const [toastHeight, setToastHeight] = useState<number | null>(null)

  useEffect(() => {
    // Check if dark mode is enabled
    const checkDarkMode = () => {
      //setIsDarkMode(document.documentElement.classList.contains('dark'))
      setIsDarkMode(
        document.documentElement.classList.contains('dark') ||
        window.matchMedia('(prefers-color-scheme: dark)').matches
      )
    }

    // Initial check
    checkDarkMode()

    // Listen for theme changes
    const observer = new MutationObserver(checkDarkMode)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [])

  // Measure toast height when a toast appears and re-position container
  useEffect(() => {
    if (typeof window === 'undefined') return

    const container = document.querySelector<HTMLElement>('.app-toaster')
    if (!container) return

    // Keep track of the currently observed toast so we can reattach the
    // ResizeObserver when the DOM changes (e.g., new toast mounts)
    let observedToast: HTMLElement | null = null

    const getFirstToast = () => {
      // react-hot-toast renders toasts as direct children within the container
      // We'll pick the first visible toast element if present
      for (const child of Array.from(container.children)) {
        const el = child as HTMLElement
        if (el.offsetParent !== null) return el
      }
      return null
    }

    const measureAndUpdate = () => {
      const toastEl = getFirstToast()
      const h = toastEl ? toastEl.getBoundingClientRect().height : null
      setToastHeight(h)
    }

    // Observe when toasts mount/unmount
    const mo = new MutationObserver(() => {
      // Re-attach the resize observer to the latest first toast (if any)
      const next = getFirstToast()
      if (next !== observedToast) {
        if (observedToast) ro.unobserve(observedToast)
        if (next) ro.observe(next)
        observedToast = next
      }
      measureAndUpdate()
    })
    mo.observe(container, { childList: true, subtree: false })

    // Also watch the first toast's size (content may wrap on resize)
    const ro = new ResizeObserver(() => measureAndUpdate())
    const attachResizeObserver = () => {
      const toastEl = getFirstToast()
      if (toastEl) {
        ro.observe(toastEl)
        observedToast = toastEl
      }
    }
    attachResizeObserver()

    // Update on viewport resize (may change wrapping/line-height)
    const onResize = () => measureAndUpdate()
    window.addEventListener('resize', onResize)

    // Initial measurement
    measureAndUpdate()

    return () => {
      mo.disconnect()
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // Dynamically position toaster so the toast is centered within #chat-header
  useEffect(() => {
    if (typeof window === 'undefined') return

    let headerEl: HTMLElement | null = null

    const updatePosition = () => {
      headerEl = document.getElementById('chat-header')
      if (!headerEl) {
        setContainerTop(null)
        return
      }
      const rect = headerEl.getBoundingClientRect()
      // If we know toast height, place the container so the toast sits centered
      // within the header: top = headerTop + (headerHeight - toastHeight)/2
      if (toastHeight != null) {
        const top = rect.top + Math.max(0, (rect.height - toastHeight) / 2)
        setContainerTop(top)
      } else {
        // Fallback: align container to header center (toast may appear slightly low)
        const top = rect.top + rect.height / 2
        setContainerTop(top)
      }
    }

    updatePosition()

    // Track header size changes
    let ro: ResizeObserver | null = null
    if ('ResizeObserver' in window) {
      ro = new ResizeObserver(() => updatePosition())
      if (headerEl) ro.observe(headerEl)
    }

    // Also update on scroll and viewport resize
    const onScroll = () => updatePosition()
    const onResize = () => updatePosition()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    return () => {
      ro?.disconnect()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [toastHeight])

  return (
    <>
      {/* Themed class-based variants (e.g., className: 'toast-warning') */}
  <style
        // Inject light/dark aware styles for custom variants like warning
        // Usage: toast(message, { className: 'toast-warning', icon: '⚠️' })
        dangerouslySetInnerHTML={{
          __html: `
            .app-toaster .toast-warning {
      background: ${isDarkMode ? '#78350f' : '#fffbeb'}; /* amber-900 | amber-50 */
      color: ${isDarkMode ? '#fde68a' : '#78350f'}; /* amber-200 | amber-900 */
      border: 1px solid ${isDarkMode ? '#f59e0b' : '#fbbf24'}; /* amber-500 | amber-400 */
              border-radius: 0.5rem;
              max-width: 28rem;
      box-shadow: 0 8px 16px -4px rgba(0, 0, 0, 0.25), 0 2px 6px -2px rgba(0, 0, 0, 0.20);
      font-weight: 600;
            }
          `,
        }}
      />
      <HotToaster
      position="top-center"
      containerClassName="app-toaster"
      containerStyle={{
        // Place the container so the toast itself is centered within #chat-header
        // If header isn't present, fall back to a small default offset
        top: containerTop != null ? `${containerTop}px` : '4.8rem',
  zIndex: 60,
        // Do NOT apply transforms here; react-hot-toast manages horizontal centering
      }}
      toastOptions={{
        duration: 5000,
        style: {
          background: isDarkMode ? '#111827' : '#f9fafb', // dark:bg-gray-900 / bg-gray-50
          color: isDarkMode ? '#f3f4f6' : '#111827', // dark:text-gray-300 / text-gray-900
          border: isDarkMode ? '1px solid #374151' : '1px solid #e5e7eb', // dark:border-gray-700 / border-gray-200
          borderRadius: '0.5rem', // rounded-lg
          maxWidth: '28rem', // max-w-md
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        },
        success: {
          style: {
            background: isDarkMode ? '#14532d' : '#f0fdf4', // dark:bg-green-900/20 / bg-green-50
            color: isDarkMode ? '#bbf7d0' : '#166534', // dark:text-green-200 / text-green-800
            border: isDarkMode ? '1px solid #166534' : '1px solid #bbf7d0', // dark:border-green-800 / border-green-200
          },
          iconTheme: {
            primary: isDarkMode ? '#4ade80' : '#22c55e', // dark:text-green-400 / text-green-500
            secondary: isDarkMode ? '#14532d' : '#f0fdf4', // dark:bg-green-900/20 / bg-green-50
          },
        },
        error: {
          style: {
            // Solid, high-contrast backgrounds for readability
            background: isDarkMode ? '#881337' : '#fee2e2', // dark: rose-900, light: rose-200
            color: isDarkMode ? '#ffe4e6' : '#7f1d1d', // dark: rose-100, light: rose-900
            border: isDarkMode ? '1px solid #fda4af' : '1px solid #fecaca', // dark: rose-300, light: rose-300
            fontWeight: 600,
          },
          iconTheme: {
            primary: isDarkMode ? '#fda4af' : '#ef4444', // rose-300 / red-500
            secondary: isDarkMode ? '#881337' : '#fee2e2',
          },
        },
      }}
    />
    </>
  )
}