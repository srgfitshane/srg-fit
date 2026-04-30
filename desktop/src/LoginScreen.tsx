import { useState, type FormEvent } from 'react'
import { supabase } from './supabase'
import { t } from './theme'

export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (authErr || !data.session) {
      setError(authErr?.message || 'Sign-in failed')
      return
    }
    onSignedIn()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%',
          maxWidth: 360,
          background: t.surface,
          border: `1px solid ${t.border}`,
          borderRadius: 16,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 900,
            background: `linear-gradient(135deg, ${t.teal}, ${t.orange})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 4,
          }}
        >
          SRG FIT COACH
        </div>
        <div style={{ fontSize: 12, color: t.textMuted, marginBottom: 6 }}>
          Sign in with your coach account.
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.textDim }}>EMAIL</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{
              background: t.surfaceUp,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              color: t.text,
              outline: 'none',
            }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.textDim }}>PASSWORD</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{
              background: t.surfaceUp,
              border: `1px solid ${t.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              color: t.text,
              outline: 'none',
            }}
          />
        </label>

        {error && (
          <div
            style={{
              fontSize: 12,
              color: t.red,
              background: t.redDim,
              border: `1px solid ${t.red}40`,
              borderRadius: 8,
              padding: '8px 10px',
            }}
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{
            background: t.teal,
            color: '#000',
            fontWeight: 800,
            fontSize: 14,
            border: 'none',
            borderRadius: 10,
            padding: '11px',
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.6 : 1,
            marginTop: 4,
          }}
        >
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
