
import sys
sys.stdout.reconfigure(encoding='utf-8')

path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\programs\[id]\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''      {/* Open Slot Modal */}
      {openSlotModal && (
        <>
          <div onClick={()=>{ setOpenSlotModal(null); setSlotConstraint('') }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300 }}/>
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:'90%', maxWidth:400, zIndex:301, fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>🎲 Add Open Slot</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20, lineHeight:1.6 }}>
              The client will choose an exercise when they start the workout. Give it a hint so they know what movement you have in mind.
            </div>'''

# Find the full modal block
start = content.find(old)
if start == -1:
    print("ERROR: Could not find modal start")
    exit(1)

# Find the end of the modal
end_marker = '        </>\n      )}\n\n    </>\n  )\n}'
end = content.find(end_marker, start)
if end == -1:
    print("ERROR: Could not find modal end")
    exit(1)
end += len('        </>\n      )}')

print(f"Found modal from {start} to {end}")
print("Old length:", end - start)

# Build the allowed filter values
MUSCLES = ['Abductors','Adductors','Biceps','Calves','Cardio','Chest','Core','Forearms',
           'Full Body','Glutes','Hamstrings','Hip Flexors','Lats','Lower Back','Obliques',
           'Quads','Rear Delts','Shoulders','Traps','Triceps']
MOVEMENTS = ['carry','core','hinge','isolation','pull','push','squat','stretch','yoga','general']
EQUIPMENT = ['barbell','bodyweight','cable','dumbbell','ez bar','kettlebell','machine','mat','pull-up bar','resistance band','smith machine','trap bar']

muscles_opts = '\n                    '.join([f'<option key="{m}" value="{m}">{m}</option>' for m in MUSCLES])
movement_opts = '\n                    '.join([f'<option key="{m}" value="{m}">{m.title()}</option>' for m in MOVEMENTS])
equipment_opts = '\n                    '.join([f'<option key="{e}" value="{e}">{e.title()}</option>' for e in EQUIPMENT])

new_modal = '''      {/* Open Slot Modal */}
      {openSlotModal && (
        <>
          <div onClick={()=>{ setOpenSlotModal(null); setSlotConstraint(''); setSlotFilterType('none'); setSlotFilterValue('') }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300 }}/>
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'92%', maxWidth:420, zIndex:301, fontFamily:"'DM Sans',sans-serif", maxHeight:'90vh', overflowY:'auto' as const }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:16 }}>🎲 Add Open Slot</div>

            {/* Label */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Label (what client sees)</div>
              <input autoFocus value={slotConstraint} onChange={e=>setSlotConstraint(e.target.value)}
                placeholder="e.g. Chest Exercise, Cardio of Choice, Pull Movement..."
                style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as const, colorScheme:'dark' }}/>
            </div>

            {/* Filter type */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Filter Library By</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:5 }}>
                {([['none','🎯 All'],['muscle','💪 Muscle'],['movement','🔄 Movement'],['equipment','🏋️ Equipment']] as const).map(([type, label]) => (
                  <button key={type} onClick={()=>{ setSlotFilterType(type as any); setSlotFilterValue('') }}
                    style={{ padding:'7px 4px', borderRadius:8, border:`1px solid ${slotFilterType===type?t.teal:t.border}`, background:slotFilterType===type?t.tealDim:'transparent', color:slotFilterType===type?t.teal:t.textMuted, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'center' as const }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter value picker */}
            {slotFilterType !== 'none' && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>
                  {slotFilterType === 'muscle' ? 'Muscle Group' : slotFilterType === 'movement' ? 'Movement Pattern' : 'Equipment'}
                </div>
                <select value={slotFilterValue} onChange={e=>setSlotFilterValue(e.target.value)}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.teal+'60', borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}>
                  <option value="">-- Pick one --</option>
                  {slotFilterType === 'muscle' && (<>
                    ''' + muscles_opts + '''
                  </>)}
                  {slotFilterType === 'movement' && (<>
                    ''' + movement_opts + '''
                  </>)}
                  {slotFilterType === 'equipment' && (<>
                    ''' + equipment_opts + '''
                  </>)}
                </select>
              </div>
            )}

            {/* Format */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Format</div>
              <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                {(['reps','time'] as const).map(type => (
                  <button key={type} onClick={()=>setSlotTracking(type)}
                    style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${slotTracking===type?t.teal+'60':t.border}`, background:slotTracking===type?t.tealDim:'transparent', color:slotTracking===type?t.teal:t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {type === 'reps' ? '🔢 Sets & Reps' : '⏱ Sets & Time'}
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Sets</div>
                  <input type="number" value={slotSets} onChange={e=>setSlotSets(e.target.value)} min="1" max="10"
                    style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}/>
                </div>
                {slotTracking === 'reps' ? (
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Reps</div>
                    <input value={slotReps} onChange={e=>setSlotReps(e.target.value)} placeholder="e.g. 8-10"
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}/>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Duration (min)</div>
                    <input type="number" value={slotDuration} onChange={e=>setSlotDuration(e.target.value)} min="1"
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}/>
                  </div>
                )}
              </div>
            </div>

            {/* Role */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Role</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' as const }}>
                {([['warmup','🔥 Warm-Up',t.teal],['main','💪 Main',t.orange],['cooldown','🧘 Cool-Down',t.purple],['finisher','🔴 Finisher',t.red]] as const).map(([role,label,color])=>(
                  <button key={role} onClick={()=>setSlotRole(role as string)}
                    style={{ padding:'6px 11px', borderRadius:8, border:`1px solid ${slotRole===role?color:t.border}`, background:slotRole===role?color+'18':'transparent', color:slotRole===role?color:t.textMuted, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ setOpenSlotModal(null); setSlotConstraint(''); setSlotFilterType('none'); setSlotFilterValue('') }}
                style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button
                onClick={()=>addOpenSlot(openSlotModal.blockId, slotConstraint, slotRole)}
                disabled={slotFilterType !== 'none' && !slotFilterValue}
                style={{ flex:2, background:slotFilterType !== 'none' && !slotFilterValue ? t.surfaceHigh : `linear-gradient(135deg,${t.yellow},${t.yellow}cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:slotFilterType !== 'none' && !slotFilterValue ? t.textMuted : '#000', cursor:slotFilterType !== 'none' && !slotFilterValue ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                🎲 Add Open Slot
              </button>
            </div>
          </div>
        </>
      )}'''

new_content = content[:start] + new_modal + content[end:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print(f"Done. New modal length: {len(new_modal)}")
