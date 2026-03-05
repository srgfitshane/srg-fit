'use client'

import { useState } from 'react'
import { markInsightRead, markInsightActioned } from '@/lib/ai-insights'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", red:"#ef4444", green:"#22c55e",
  text:"#eeeef8", textMuted:"#5a5a78",
}

const PRIORITY_META: Record<string, { color: string; icon: string; label: string }> = {
  urgent: { color: t.red,      icon: '🚨', label: 'Urgent' },
  high:   { color: t.orange,   icon: '⚠️',  label: 'High'   },
  normal: { color: t.teal,     icon: '📊', label: 'Info'   },
  low:    { color: t.textMuted, icon: '💡', label: 'Low'   },
}

const TYPE_LABEL: Record<string, string> = {
  checkin_brief: 'Check-in Brief', progression: 'Progression',
  red_flag: 'Red Flag', recommended_action: 'Suggested Action',
}

interface Insight {
  id: string; type: string; title: string; priority: string
  content: any; created_at: string
  client?: { profile?: { full_name?: string } }
}

interface Props {
  insights: Insight[]
  onDismiss: (id: string) => void
  onClose: () => void
}

export default function AiInsightsPanel({ insights, onDismiss, onClose }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)

  const handleDismiss = async (id: string) => {
    await markInsightRead(id)
    onDismiss(id)
  }

  const handleAction = async (id: string) => {
    setActioning(id)
    await markInsightActioned(id)
    onDismiss(id)
    setActioning(null)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(12px)', zIndex:300, display:'flex', alignItems:'flex-start', justifyContent:'flex-end', padding:'60px 16px 16px' }}>
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:460, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'20px 20px 16px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:800 }}>AI Coaching Insights</div>
            <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{insights.length} unread • For your eyes only</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, padding:'4px 8px' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:12, display:'flex', flexDirection:'column', gap:8 }}>
          {insights.length === 0 ? (
            <div style={{ padding:'32px 16px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
              All caught up! Insights appear after client check-ins and workouts.
            </div>
          ) : insights.map(insight => {
            const pm = PRIORITY_META[insight.priority] || PRIORITY_META.normal
            const isOpen = expanded === insight.id
            const c = insight.content || {}
            return (
              <div key={insight.id} style={{ background:t.surfaceUp, border:'1px solid '+(isOpen?pm.color+'40':t.border), borderRadius:14, overflow:'hidden' }}>
                <div onClick={()=>setExpanded(isOpen?null:insight.id)} style={{ padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ fontSize:16, lineHeight:1, marginTop:1 }}>{pm.icon}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4, flexWrap:'wrap' }}>
                      <span style={{ background:pm.color+'18', border:'1px solid '+pm.color+'40', borderRadius:5, padding:'1px 7px', fontSize:9, fontWeight:800, color:pm.color, letterSpacing:'0.06em' }}>{pm.label}</span>
                      <span style={{ background:t.surfaceHigh, borderRadius:5, padding:'1px 7px', fontSize:9, fontWeight:700, color:t.textMuted }}>{TYPE_LABEL[insight.type]||insight.type}</span>
                      {insight.client?.profile?.full_name && <span style={{ fontSize:10, color:t.teal, fontWeight:700 }}>{insight.client.profile.full_name}</span>}
                    </div>
                    <div style={{ fontSize:13, fontWeight:700, lineHeight:1.3 }}>{insight.title}</div>
                    {c.summary && !isOpen && <div style={{ fontSize:11, color:t.textMuted, marginTop:4, lineHeight:1.5, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{c.summary}</div>}
                  </div>
                  <div style={{ color:t.textMuted, fontSize:12, flexShrink:0 }}>{isOpen?'▲':'▼'}</div>
                </div>

                {isOpen && (
                  <div style={{ borderTop:'1px solid '+t.border, padding:'14px' }}>
                    {c.summary && <div style={{ fontSize:12, color:t.text, lineHeight:1.7, marginBottom:12 }}>{c.summary}</div>}
                    {c.bullets?.length > 0 && (
                      <div style={{ marginBottom:12 }}>
                        {c.bullets.map((b: string, i: number) => (
                          <div key={i} style={{ display:'flex', gap:8, marginBottom:6, fontSize:12, color:t.textMuted, lineHeight:1.5 }}>
                            <span style={{ color:pm.color, flexShrink:0, fontWeight:800 }}>→</span><span>{b}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {c.suggested_action && (
                      <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 12px', marginBottom:12 }}>
                        <div style={{ fontSize:9, fontWeight:900, color:t.teal, letterSpacing:'0.08em', marginBottom:4 }}>SUGGESTED ACTION</div>
                        <div style={{ fontSize:12, color:t.text, lineHeight:1.6 }}>{c.suggested_action}</div>
                      </div>
                    )}
                    {c.data_confidence && (
                      <div style={{ fontSize:10, color:t.textMuted, marginBottom:12 }}>
                        Data confidence: <span style={{ color:c.data_confidence==='high'?t.green:c.data_confidence==='medium'?t.orange:t.textMuted, fontWeight:700 }}>{c.data_confidence}</span>
                      </div>
                    )}
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={()=>handleDismiss(insight.id)} style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Dismiss</button>
                      <button onClick={()=>handleAction(insight.id)} disabled={actioning===insight.id} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        {actioning===insight.id?'Saving...':'✓ Mark Actioned'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div style={{ padding:'12px 20px', borderTop:'1px solid '+t.border }}>
          <div style={{ fontSize:10, color:t.textMuted, textAlign:'center', lineHeight:1.6 }}>
            AI insights are generated from client data for coaching use only. Not visible to clients.
          </div>
        </div>
      </div>
    </div>
  )
}
