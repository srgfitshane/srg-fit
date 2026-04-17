import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\reviews\page.tsx'
lines = open(path, 'r', encoding='utf-8').read().split('\n')

# Lines before VideoReviewer (0-indexed, keep lines 0..199)
before = lines[:200]  # up to but not including line 201

# Lines from export default onwards (keep lines 478..end)
after = lines[478:]

new_component_lines = [
    '// \u2500\u2500 VideoReviewer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500',
    'type VideoReviewerProps = {',
    '  onReady: (blob: Blob) => void',
    '  onLink: (url: string) => void',
    '  onClear: () => void',
    '  uploading: boolean',
    '  doneUrl: string',
    '}',
    '',
    'function VideoReviewer({ onReady, onLink, onClear, uploading, doneUrl }: VideoReviewerProps) {',
    "  const [linkInput, setLinkInput] = useState('')",
    '  const [showLinkInput, setShowLinkInput] = useState(false)',
    '',
    '  if (doneUrl) return (',
    '    <div style={{ display:\'flex\', flexDirection:\'column\' as const, gap:8 }}>',
    '      <div style={{ display:\'flex\', alignItems:\'center\', gap:8, background:t.surfaceHigh, border:`1px solid ${t.green}40`, borderRadius:10, padding:\'10px 14px\' }}>',
    '        <span style={{ fontSize:18 }}>\u2705</span>',
    '        <div style={{ flex:1, minWidth:0 }}>',
    '          <div style={{ fontSize:12, fontWeight:800, color:t.green }}>Review Video Added</div>',
    "          <div style={{ fontSize:11, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{doneUrl}</div>",
    '        </div>',
    "        <a href={doneUrl} target='_blank' rel='noreferrer'",
    "          style={{ fontSize:11, fontWeight:700, color:t.teal, textDecoration:'none', flexShrink:0 }}>View \u2197</a>",
    '        <button onClick={onClear}',
    "          style={{ background:'rgba(255,80,80,0.1)', border:'1px solid rgba(255,80,80,0.3)', borderRadius:6, padding:'4px 8px', fontSize:11, color:'#ff5050', cursor:'pointer', flexShrink:0 }}>",
    '          Remove',
    '        </button>',
    '      </div>',
    '    </div>',
    '  )',
    '',
    '  return (',
    '    <div style={{ display:\'flex\', flexDirection:\'column\' as const, gap:8 }}>',
    "      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>",
    "        <label style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, background:t.surface, border:`2px solid ${t.teal}40`, borderRadius:10, padding:'14px 8px', cursor: uploading ? 'not-allowed' : 'pointer', textAlign:'center' as const, opacity: uploading ? 0.6 : 1 }}>",
    "          <span style={{ fontSize:24 }}>{uploading ? '\u23f3' : '\U0001f4c1'}</span>",
    "          <span style={{ fontSize:11, fontWeight:800, color:t.teal }}>{uploading ? 'Uploading...' : 'Upload Video'}</span>",
    "          <span style={{ fontSize:10, color:t.textMuted }}>MP4, MOV, etc.</span>",
    "          <input type='file' accept='video/mp4,video/quicktime,video/webm,video/*' style={{ display:'none' }}",
    '            disabled={uploading}',
    '            onChange={e=>{ const f=e.target.files?.[0]; if(f) onReady(f as unknown as Blob) }}/>',
    '        </label>',
    '        <button onClick={()=>setShowLinkInput(v=>!v)}',
    "          style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, background:t.surface, border:`1px solid ${showLinkInput ? t.teal+'60' : t.border}`, borderRadius:10, padding:'14px 8px', cursor:'pointer', fontFamily:\"'DM Sans',sans-serif\" }}>",
    "          <span style={{ fontSize:24 }}>\U0001f517</span>",
    "          <span style={{ fontSize:11, fontWeight:700, color:showLinkInput ? t.teal : t.text }}>Paste Link</span>",
    "          <span style={{ fontSize:10, color:t.textMuted }}>Cap, Loom, Drive...</span>",
    '        </button>',
    '      </div>',
    '      {showLinkInput && (',
    "        <div style={{ display:'flex', gap:8 }}>",
    '          <input autoFocus value={linkInput} onChange={e=>setLinkInput(e.target.value)}',
    "            placeholder='https://cap.so/share/... or any video link'",
    "            onKeyDown={e=>{ if(e.key==='Enter' && linkInput.trim()) { onLink(linkInput.trim()); setShowLinkInput(false); setLinkInput('') }}}",
    "            style={{ flex:1, background:t.surfaceHigh, border:`1px solid ${t.teal}60`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:\"'DM Sans',sans-serif\", colorScheme:'dark' }}/>",
    "          <button onClick={()=>{ if(linkInput.trim()) { onLink(linkInput.trim()); setShowLinkInput(false); setLinkInput('') }}}",
    '            disabled={!linkInput.trim()}',
    "            style={{ background:linkInput.trim()?`linear-gradient(135deg,${t.teal},#00a896)`:t.surfaceHigh, border:'none', borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:800, color:linkInput.trim()?'#000':t.textMuted, cursor:linkInput.trim()?'pointer':'default', fontFamily:\"'DM Sans',sans-serif\" }}>",
    '            Add',
    '          </button>',
    '        </div>',
    '      )}',
    '    </div>',
    '  )',
    '}',
    '',
]

new_lines = before + new_component_lines + after
open(path, 'w', encoding='utf-8').write('\n'.join(new_lines))
print(f'Done. Before: {len(lines)} lines, After: {len(new_lines)} lines')
