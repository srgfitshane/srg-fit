'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg: '#0f0f0f', surface: '#1a1a1a', surfaceHigh: '#242424',
  border: '#2a2a2a', accent: '#c8f545', text: '#f0f0f0',
  textDim: '#888', textMuted: '#555', success: '#22c55e'
}

const PREFS = [
  { section: 'In-App Notifications', items: [
    { key: 'inapp_messages',  label: 'New messages',          icon: '💬' },
    { key: 'inapp_checkins',  label: 'Check-in submissions',  icon: '📋' },
    { key: 'inapp_payments',  label: 'Payment & billing',     icon: '💳' },
    { key: 'inapp_general',   label: 'General updates',       icon: '🔔' },
  ]},
  { section: 'Email Notifications', items: [
    { key: 'email_messages',  label: 'New messages',          icon: '💬' },
    { key: 'email_checkins',  label: 'Check-in submissions',  icon: '📋' },
    { key: 'email_payments',  label: 'Payment & billing',     icon: '💳' },
    { key: 'email_general',   label: 'General updates',       icon: '🔔' },
  ]},
]

type PrefsState = Record<string, boolean>

export default function NotificationPrefsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [prefs, setPrefs] = useState<PrefsState>({
    inapp_messages: true, inapp_checkins: true, inapp_payments: true, inapp_general: true,
    email_messages: false, email_checkins: true, email_payments: true, email_general: false,
  })
  const [emailOverride, setEmailOverride] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (data) {
      setPrefs({
        inapp_messages: data.inapp_messages ?? true,
        inapp_checkins: data.inapp_checkins ?? true,
        inapp_payments: data.inapp_payments ?? true,
        inapp_general:  data.inapp_general  ?? true,
        email_messages: data.email_messages ?? false,
        email_checkins: data.email_checkins ?? true,
        email_payments: data.email_payments ?? true,
        email_general:  data.email_general  ?? false,
      })
      setEmailOverride(data.email_override || '')
    }
    setLoading(false)
  }

  async function save() {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('notification_preferences').upsert({
      user_id: user.id,
      ...prefs,
      email_override: emailOverride.trim() || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const toggle = (key: string) => setPrefs(p => ({ ...p, [key]: !p[key] }))

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'DM Sans',sans-serif", padding: '32px 24px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <button onClick={() => router.back()}
          style={{ background: 'none', border: 'none', color: t.textDim, cursor: 'pointer', fontSize: 13, marginBottom: 20, display: 'block' }}>
          ← Back
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>Notification Preferences</h1>
        <p style={{ color: t.textDim, fontSize: 13, margin: '0 0 32px' }}>Choose how you want to be notified.</p>

        {loading ? (
          <p style={{ color: t.textMuted }}>Loading...</p>
        ) : (
          <>
            {PREFS.map(section => (
              <div key={section.section} style={{ marginBottom: 28 }}>
                <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                  {section.section}
                </h2>
                <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, overflow: 'hidden' }}>
                  {section.items.map((item, i) => (
                    <div key={item.key}
                      style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: i < section.items.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                      <span style={{ fontSize: 18, marginRight: 12 }}>{item.icon}</span>
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                      <label style={{ position: 'relative', width: 44, height: 24, cursor: 'pointer', flexShrink: 0 }}>
                        <input type="checkbox" checked={!!prefs[item.key]} onChange={() => toggle(item.key)}
                          style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }} />
                        <span style={{
                          position: 'absolute', inset: 0, borderRadius: 24,
                          background: prefs[item.key] ? t.accent : t.surfaceHigh,
                          border: `1px solid ${prefs[item.key] ? t.accent : t.border}`,
                          transition: 'all 0.2s'
                        }} />
                        <span style={{
                          position: 'absolute', top: 3, left: prefs[item.key] ? 22 : 3,
                          width: 16, height: 16, borderRadius: '50%',
                          background: prefs[item.key] ? '#0f0f0f' : t.textMuted,
                          transition: 'all 0.2s'
                        }} />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Email override */}
            <div style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 13, fontWeight: 700, color: t.textDim, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px' }}>
                Email Address
              </h2>
              <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 14, padding: '14px 18px' }}>
                <p style={{ fontSize: 12, color: t.textDim, margin: '0 0 10px' }}>Leave blank to use your account email. Or specify a different address for notifications.</p>
                <input
                  value={emailOverride}
                  onChange={e => setEmailOverride(e.target.value)}
                  placeholder="alternate@email.com"
                  type="email"
                  style={{ width: '100%', background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px', color: t.text, fontSize: 14, outline: 'none', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }}
                />
              </div>
            </div>

            <button onClick={save} disabled={saving}
              style={{ width: '100%', background: saved ? t.success : t.accent, border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 700, color: '#0f0f0f', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1, fontFamily: "'DM Sans',sans-serif", transition: 'background 0.3s' }}>
              {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Preferences'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
