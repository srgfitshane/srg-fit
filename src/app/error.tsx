'use client'

// Global error boundary — catches any render exception thrown by a
// route segment under /app. Without this, an uncaught error in a client
// component renders as a blank screen with no UI to recover. Now the
// user sees a real message + a Reload button, and the error reaches
// the console for debugging.
//
// This complements `global-error.tsx` (which catches failures in the
// ROOT layout itself). Most user-facing crashes land here.

import { useEffect } from 'react'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface to console so we can debug from a screen recording or
    // remote inspect. The digest is the server-side stack ref.
    console.error('[srg-fit:error-boundary]', error?.message, error?.digest, error)
  }, [error])

  return (
    <div style={{
      minHeight: '100vh',
      background: '#080810',
      color: '#eeeef8',
      fontFamily: "'DM Sans', sans-serif",
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>🛠️</div>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>Something went wrong</h1>
      <p style={{ fontSize: 14, color: '#8888a8', marginBottom: 28, maxWidth: 420, lineHeight: 1.55 }}>
        The page hit an error while loading. This usually means a transient
        hiccup — most of the time a reload fixes it. If it keeps happening,
        text Shane and include what you were doing.
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={() => reset()}
          style={{
            background: 'linear-gradient(135deg, #00c9b1, #00c9b1cc)',
            border: 'none',
            borderRadius: 10,
            padding: '11px 24px',
            fontSize: 14,
            fontWeight: 800,
            color: '#000',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>
          Try again
        </button>
        <button
          onClick={() => { window.location.href = '/dashboard' }}
          style={{
            background: 'transparent',
            border: '1px solid #252538',
            borderRadius: 10,
            padding: '11px 24px',
            fontSize: 14,
            fontWeight: 700,
            color: '#8888a8',
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
          }}>
          Go to dashboard
        </button>
      </div>
      {process.env.NODE_ENV === 'development' && error?.message && (
        <pre style={{
          marginTop: 32,
          padding: 16,
          background: '#0f0f1a',
          border: '1px solid #252538',
          borderRadius: 10,
          fontSize: 11,
          color: '#ef4444',
          maxWidth: 720,
          overflow: 'auto',
          textAlign: 'left',
          whiteSpace: 'pre-wrap',
        }}>
          {error.message}
          {error.digest ? `\n\nDigest: ${error.digest}` : ''}
        </pre>
      )}
    </div>
  )
}
