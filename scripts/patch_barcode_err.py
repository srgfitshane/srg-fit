path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\nutrition-tab.tsx'
src = open(path, encoding='utf-8').read()

old = "            {barcodeErr && <div style={{ fontSize:12, color:t.orange, marginTop:8 }}>{barcodeErr}</div>}"
new = """            {barcodeErr && (
                <div style={{ marginTop:8 }}>
                  <div style={{ fontSize:12, color:t.orange, marginBottom:6 }}>{barcodeErr}</div>
                  <button onClick={()=>{ setBarcodeErr(''); setAddMode('quick') }}
                    style={{ fontSize:12, fontWeight:700, color:t.teal, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    \u2192 Try Quick Add
                  </button>
                </div>
              )}"""

if old in src:
    src = src.replace(old, new, 1)
    open(path, 'w', encoding='utf-8').write(src)
    print('done')
else:
    print('NOT FOUND')
    print(repr(src[src.find('barcodeErr &&'):src.find('barcodeErr &&')+100]))
