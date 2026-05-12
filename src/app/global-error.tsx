'use client'

// Last-resort error boundary — catches failures in the ROOT layout
// itself (e.g. theme provider crash, a thrown error during initial
// render before any route segment mounts). global-error.tsx must
// supply its own <html> and <body> because the root layout's may not
// have rendered.
//
// 99% of crashes are caught by /app/error.tsx instead. This is the
// blast door for the remaining 1%.

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[srg-fit:global-error]', error?.message, error?.digest, error)
  }, [error])

  return (
    <html>
      <body style={{
        minHeight: '100vh',
        margin: 0,
        background: '#080810',
        color: '#eeeef8',
        fontFamily: "'DM Sans', system-ui, sans-serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>App failed to load</h1>
        <p style={{ fontSize: 14, color: '#8888a8', marginBottom: 28, maxWidth: 420, lineHeight: 1.55 }}>
          Try reloading the app. If this keeps happening, text Shane.
        </p>
        <button
          onClick={() => reset()}
          style={{
            background: '#00c9b1',
            border: 'none',
            borderRadius: 10,
            padding: '11px 24px',
            fontSize: 14,
            fontWeight: 800,
            color: '#000',
            cursor: 'pointer',
          }}>
          Reload
        </button>
      </body>
    </html>
  )
}
