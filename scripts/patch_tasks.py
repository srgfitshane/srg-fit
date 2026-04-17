import sys
sys.stdout.reconfigure(encoding='utf-8')

# ── 1. Calendar page patches ──────────────────────────────────────────────────
cal_path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\calendar\page.tsx'
content = open(cal_path, 'r', encoding='utf-8').read()

# 1a. Add icon to ClientTask type
content = content.replace(
    '''type ClientTask = {
  id: string
  title: string
  repeat: 'once' | 'daily' | 'weekly'
  due_date: string | null
  last_completed_date: string | null
}''',
    '''type ClientTask = {
  id: string
  title: string
  repeat: 'once' | 'daily' | 'weekly'
  due_date: string | null
  last_completed_date: string | null
  icon: string | null
}'''
)

# 1b. Add taskIcon state alongside existing task states
content = content.replace(
    "const [showAddTask,  setShowAddTask]  = useState(false)",
    "const [showAddTask,  setShowAddTask]  = useState(false)\n  const [taskIcon, setTaskIcon] = useState('✅')"
)

# 1c. Auto-open modal if ?addTask=1 — add after showAddTask state
content = content.replace(
    "const [taskIcon, setTaskIcon] = useState('✅')",
    """const [taskIcon, setTaskIcon] = useState('✅')

  // Auto-open add task modal if navigated with ?addTask=1
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('addTask') === '1') {
        setShowAddTask(true)
        // Clean up the URL param without navigation
        const url = new URL(window.location.href)
        url.searchParams.delete('addTask')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [])"""
)

# 1d. Add icon to saveTask — find the insert and add icon field
content = content.replace(
    "repeat: taskRepeat, due_date: taskRepeat==='once'?taskDate:null",
    "repeat: taskRepeat, due_date: taskRepeat==='once'?taskDate:null, icon: taskIcon"
)

# 1e. Reset taskIcon after save
content = content.replace(
    "setShowAddTask(false); setTaskSaving(false)",
    "setShowAddTask(false); setTaskSaving(false); setTaskIcon('✅')"
)

# 1f. Add emoji picker to the modal — insert before the save button
EMOJI_PICKER = '''
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:8 }}>Icon</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                {['✅','⭐','💊','💧','📖','🏃','🧘','💪','🥗','😴','🎯','🔔','📝','🛒','💰','🧹','📞','🚗','❤️','🔥'].map(e => (
                  <button key={e} onClick={()=>setTaskIcon(e)}
                    style={{ width:38, height:38, borderRadius:9, border:'2px solid '+(taskIcon===e?t.teal:t.border), background:taskIcon===e?t.tealDim:t.surfaceHigh, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
'''

content = content.replace(
    "            <button onClick={saveTask} disabled={!taskTitle.trim() || taskSaving}",
    EMOJI_PICKER + "            <button onClick={saveTask} disabled={!taskTitle.trim() || taskSaving}"
)

open(cal_path, 'w', encoding='utf-8').write(content)
print('Calendar page patched')

# ── 2. Dashboard page patches ─────────────────────────────────────────────────
dash_path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
content = open(dash_path, 'r', encoding='utf-8').read()

# 2a. +Task button: navigate with ?addTask=1
content = content.replace(
    "onClick={()=>router.push('/dashboard/client/calendar')}",
    "onClick={()=>router.push('/dashboard/client/calendar?addTask=1')}"
)

# 2b. Make entire task row tappable (like vitamins), show icon
OLD_TASK_ROW = '''                    <div key={task.id} style={{ background:t.surface, border:'1px solid '+(done?t.green+'40':t.teal+'30'), borderRadius:13, padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                      <button onClick={()=> done ? uncompleteTask(task.id) : completeTask(task.id)}
                        style={{ width:28, height:28, borderRadius:8, border:'2px solid '+(done?t.green:t.teal+'60'), background:done?t.green+'22':t.tealDim, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, fontSize:14, color:done?t.green:t.teal }}>
                        {done ? '✓' : ''}
                      </button>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, textDecoration:done?'line-through':'none', color:done?t.textMuted:t.text }}>{task.title}</div>
                        {task.repeat !== 'once' && <div style={{ fontSize:11, color:t.textMuted, marginTop:1, textTransform:'capitalize' as const }}>{task.repeat}</div>}
                      </div>
                    </div>'''

NEW_TASK_ROW = '''                    <div key={task.id}
                      onClick={()=> done ? uncompleteTask(task.id) : completeTask(task.id)}
                      style={{ background:done?t.green+'10':t.surface, border:'1px solid '+(done?t.green+'40':t.teal+'30'), borderRadius:13, padding:'12px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer', transition:'all 0.15s ease' }}>
                      <div style={{ width:32, height:32, borderRadius:9, background:done?'linear-gradient(135deg,'+t.green+','+t.green+'aa)':t.surfaceHigh, border:'1px solid '+(done?t.green+'60':t.border), display:'flex', alignItems:'center', justifyContent:'center', fontSize:done?13:18, flexShrink:0, transition:'all 0.2s ease' }}>
                        {done ? '✓' : (task.icon || '✅')}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, textDecoration:done?'line-through':'none', color:done?t.textMuted:t.text }}>{task.title}</div>
                        {task.repeat !== 'once' && <div style={{ fontSize:11, color:t.textMuted, marginTop:1, textTransform:'capitalize' as const }}>{task.repeat}</div>}
                      </div>
                    </div>'''

if OLD_TASK_ROW in content:
    content = content.replace(OLD_TASK_ROW, NEW_TASK_ROW)
    print('Task row patched')
else:
    print('WARNING: task row not found - may need manual fix')

open(dash_path, 'w', encoding='utf-8').write(content)
print('Dashboard page patched')
print('All done!')
