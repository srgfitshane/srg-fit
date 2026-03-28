'use client'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

const t = {
  surface: '#0f0f1a', border: '#252538',
  teal: '#00c9b1', textMuted: '#5a5a78',
}

const NAV = [
  { id: 'today',     label: 'Home',      path: '/dashboard/client',           tab: 'today'     },
  { id: 'nutrition', label: 'Nutrition', path: '/dashboard/client',           tab: 'nutrition' },
  { id: 'resources', label: 'Resources', path: '/dashboard/client/resources', tab: ''          },
  { id: 'messages',  label: 'Messages',  path: '/dashboard/client',           tab: 'messages'  },
  { id: 'metrics',   label: 'Metrics',   path: '/dashboard/client/progress',  tab: ''          },
]

const NavIcon = ({ id, active }: { id: string; active: boolean }) => {
  const c = active ? t.teal : t.textMuted
  const s = { width: 22, height: 22 } as const
  if (id === 'today') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  )
  if (id === 'nutrition') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  )
  if (id === 'resources') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
    </svg>
  )
  if (id === 'messages') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
  return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
}

function getActive(pathname: string, tab: string | null): string {
  if (pathname === '/dashboard/client') {
    if (tab === 'nutrition') return 'nutrition'
    if (tab === 'messages') return 'messages'
    return 'today'
  }
  if (pathname.startsWith('/dashboard/client/resources'))   return 'resources'
  if (pathname.startsWith('/dashboard/client/progress'))    return 'metrics'
  if (pathname.startsWith('/dashboard/client/metrics'))     return 'metrics'
  if (pathname.startsWith('/dashboard/client/community'))   return 'messages'
  return 'today'
}

export default function ClientBottomNav() {
  const router   = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const active   = getActive(pathname, searchParams.get('tab'))

  const handleClick = (n: typeof NAV[0]) => {
    if (n.tab) {
      router.push(n.path + '?tab=' + n.tab)
    } else {
      router.push(n.path)
    }
  }

  return (
    <>
      <div style={{ height: 68 }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480,
        background: t.surface, borderTop: '1px solid ' + t.border,
        display: 'flex', alignItems: 'center', height: 60, zIndex: 9999,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {NAV.map(n => (
          <button key={n.id} onClick={() => handleClick(n)}
            aria-label={`Open ${n.label}`}
            aria-pressed={active === n.id}
            style={{
              flex: 1, background: 'none', border: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 4, cursor: 'pointer',
              padding: '8px 0', position: 'relative',
            }}>
            {active === n.id && (
              <div style={{
                position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                width: 20, height: 2.5, borderRadius: 2, background: t.teal,
              }} />
            )}
            <NavIcon id={n.id} active={active === n.id} />
            <span style={{
              fontSize: 10, fontWeight: active === n.id ? 700 : 500,
              color: active === n.id ? t.teal : t.textMuted,
              fontFamily: "'DM Sans', sans-serif",
            }}>
              {n.label}
            </span>
          </button>
        ))}
      </div>
    </>
  )
}
