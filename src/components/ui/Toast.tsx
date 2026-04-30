// Tiny global toast system. No context, no store -- just a CustomEvent
// fired against window. Any component can call showToast() without setup,
// and a single <ToastRoot /> mounted in the root layout subscribes and
// renders the stack. Replaces alert() so mobile users no longer get
// blocking system modals on save errors.

'use client'
import { useEffect, useState } from 'react'

type ToastType = 'error' | 'success' | 'info'

type ToastInput = {
  type?: ToastType
  message: string
  duration?: number
}

type Toast = {
  id: string
  type: ToastType
  message: string
  duration: number
}

const EVENT = 'srg-toast'

export function showToast(input: ToastInput) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: input }))
}

// Convenience helpers
export const toastError   = (message: string, duration?: number) => showToast({ type: 'error',   message, duration })
export const toastSuccess = (message: string, duration?: number) => showToast({ type: 'success', message, duration })
export const toastInfo    = (message: string, duration?: number) => showToast({ type: 'info',    message, duration })

export default function ToastRoot() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ToastInput>).detail
      if (!detail || !detail.message) return
      const type: ToastType = detail.type || 'info'
      const t: Toast = {
        id: Math.random().toString(36).slice(2),
        type,
        message: detail.message,
        // Errors stick longer than confirmations
        duration: detail.duration ?? (type === 'error' ? 5500 : 3200),
      }
      setToasts(prev => [...prev, t].slice(-3))
      window.setTimeout(() => {
        setToasts(prev => prev.filter(x => x.id !== t.id))
      }, t.duration)
    }
    window.addEventListener(EVENT, handler as EventListener)
    return () => window.removeEventListener(EVENT, handler as EventListener)
  }, [])

  const dismiss = (id: string) => setToasts(prev => prev.filter(x => x.id !== id))

  if (toasts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        // Sit above the client bottom-nav (z-index 9999) and respect iOS safe area.
        // Bottom-center on mobile, slides to bottom-right on wider screens.
        left: 0, right: 0,
        bottom: 'calc(80px + env(safe-area-inset-bottom))',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        padding: '0 16px',
        zIndex: 10000,
        pointerEvents: 'none',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {toasts.map(t => {
        const palette = t.type === 'error'
          ? { bg: 'var(--red-dim, #ef444415)', bd: 'var(--red, #ef4444)', fg: 'var(--red, #ef4444)' }
          : t.type === 'success'
          ? { bg: 'var(--green-dim, #22c55e15)', bd: 'var(--green, #22c55e)', fg: 'var(--green, #22c55e)' }
          : { bg: 'var(--surface, #1d1d2e)', bd: 'var(--border, #252538)', fg: 'var(--text, #eeeef8)' }
        return (
          <div
            key={t.id}
            style={{
              pointerEvents: 'auto',
              maxWidth: 480,
              width: '100%',
              background: palette.bg,
              border: `1px solid ${palette.bd}`,
              borderRadius: 12,
              padding: '12px 14px',
              fontSize: 13,
              fontWeight: 600,
              color: palette.fg,
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              animation: 'srg-toast-in 0.18s ease-out',
            }}
          >
            <span style={{ flex: 1, lineHeight: 1.45, wordBreak: 'break-word' }}>{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Dismiss"
              style={{
                background: 'none',
                border: 'none',
                color: palette.fg,
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: 0,
                marginLeft: 4,
                opacity: 0.7,
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <style>{`@keyframes srg-toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
