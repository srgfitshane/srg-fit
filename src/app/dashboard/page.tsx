'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function DashboardRedirect() {
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const redirect = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: profile } = await supabase
        .from('profiles').select('role').eq('id', user.id).single()
      router.push(profile?.role === 'coach' ? '/dashboard/coach' : '/dashboard/client')
    }
    redirect()
  }, [])

  return (
    <div style={{ background:'#080810', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:'#00c9b1', fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )
}
