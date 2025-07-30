import { useEffect, useState } from 'react'

export function Toaster() {
  const [messages, setMessages] = useState<string[]>([])

  useToast((msg) => {
    setMessages((prev) => [...prev, msg])
    setTimeout(() => {
      setMessages((prev) => prev.slice(1))
    }, 5000)
  })

  return (
    <div
      style={{
        position: 'fixed',
        top: '1rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
      }}
    >
      {messages.map((msg, i) => (
        <div
          key={i}
          style={{
            background: '#10b981',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: '4px',
            marginTop: '4px',
          }}
        >
          {msg}
        </div>
      ))}
    </div>
  )
}

const listeners: ((message: string) => void)[] = []

export const toast = {
  success(message: string) {
    listeners.forEach((l) => l(message))
  },
  subscribe(listener: (message: string) => void) {
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index > -1) listeners.splice(index, 1)
    }
  },
}

export function useToast(onToast: (message: string) => void) {
  useEffect(() => {
    const unsub = toast.subscribe(onToast)
    return unsub
  }, [onToast])
}
