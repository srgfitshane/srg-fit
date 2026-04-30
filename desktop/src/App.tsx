import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import LoginScreen from './LoginScreen'
import InboxView from './InboxView'
import { t } from './theme'

type Session = {
  userId: string
  fullName: string
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  const loadSession = async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      setSession(null)
      setBootstrapping(false)
      return
    }
    const userId = data.session.user.id
    // Pull display name from profiles for the header. Lightweight single-row fetch.
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single()
    setSession({ userId, fullName: profile?.full_name || 'Coach' })
    setBootstrapping(false)
  }

  useEffect(() => {
    void loadSession()
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _newSession) => {
      void loadSession()
    })
    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    setSession(null)
  }

  if (bootstrapping) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: t.textMuted,
          fontSize: 12,
        }}
      >
        Starting...
      </div>
    )
  }

  if (!session) {
    return <LoginScreen onSignedIn={() => void loadSession()} />
  }

  return (
    <InboxView
      coachUserId={session.userId}
      coachName={session.fullName}
      onSignOut={handleSignOut}
    />
  )
}
