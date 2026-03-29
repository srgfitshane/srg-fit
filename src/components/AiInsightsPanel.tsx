'use client'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', purple:'#8b5cf6', red:'#ef4444', redDim:'#ef444415',
  orange:'#f5a623', green:'#22c55e', text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const FLAG_META: Record<string,{label:string,color:string,bg:string}> = {
  urgent:{ label:'Urgent', color:'#ef4444', bg:'#ef444418' },
  high:  { label:'High',   color:'#f5a623', bg:'#f5a62318' },
  normal:{ label:'Normal', color:'#00c9b1', bg:'#00c9b115' },
  low:   { label:'Low',    color:'#5a5a78', bg:'#5a5a7818' },
}

const TYPE_ICONS: Record<string,string> = {
  checkin_brief:'📋', progression:'📈', red_flag:'🚨', recommended_action:'⚡',
}

type DashboardInsight = {
  id: string
  type: string
  flag_level?: string | null
  content?: {
    title?: string | null
    summary?: string | null
    suggested_action?: string | null
  } | null
}

interface Props {
  insights: DashboardInsight[]
  onDismiss: (id: string) => void
  onClose: () => void
}

export default function AiInsightsPanel({ insights, onDismiss, onClose }: Props) {
  const router = useRouter()
  return (
    <div style={{ position:'fixed', inset:0, background:'#000000aa', display:'flex', alignItems:'flex-start', justifyContent:'flex-end', zIndex:500, padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, width:380, maxHeight:'85vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ padding:'16px 18px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:14, fontWeight:800 }}>🧠 Coach Copilot <span style={{ fontSize:11, color:t.textMuted, fontWeight:500 }}>({insights.length} unread)</span></div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={()=>{ onClose(); router.push('/dashboard/coach/insights') }}
              style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              View All →
            </button>
            <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, fontFamily:"'DM Sans',sans-serif" }}>✕</button>
          </div>
        </div>
        {insights.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:t.textMuted, fontSize:13 }}>All caught up! 🎉</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
            {insights.map(insight => {
              const c = insight.content || {}
              const fm = FLAG_META[insight.flag_level||'normal'] || FLAG_META.normal
              return (
                <div key={insight.id} style={{ padding:'14px 18px', borderBottom:'1px solid '+t.border }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <span style={{ fontSize:20, flexShrink:0 }}>{TYPE_ICONS[insight.type]||'🤖'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', gap:5, alignItems:'center', marginBottom:4, flexWrap:'wrap' }}>
                        <span style={{ fontSize:12, fontWeight:700 }}>{c.title || insight.type}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:20, background:fm.bg, color:fm.color }}>{fm.label}</span>
                      </div>
                      {c.summary && <div style={{ fontSize:11, color:t.textDim, lineHeight:1.5, marginBottom:6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>{c.summary}</div>}
                      {c.suggested_action && <div style={{ fontSize:11, color:t.purple, fontWeight:600 }}>⚡ {c.suggested_action}</div>}
                    </div>
                    <button onClick={()=>onDismiss(insight.id)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12, flexShrink:0 }}>✕</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
