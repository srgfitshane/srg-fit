
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()

# The broken line has the GIF panel closing merged with macro button style remnant
# Fix: the line ending with )}t, border:... should be just             )}
old = "              )}\nt, border:'1px solid '+c.border, fontSize:11 }}\n                    >\n                      {macro.title}\n                    </button>\n                  ))}\n                </div>\n              )}"

new = """              )}
              {showMacros && quickReplies.length > 0 && (
                <div className="rmt-macro-row">
                  {quickReplies.map((macro) => (
                    <button
                      key={macro.id}
                      aria-label={`Insert saved reply ${macro.title}`}
                      onClick={()=>applyMacro(macro.body)}
                      style={{ ...btnBase, padding:'5px 10px', background:c.surfaceHigh, color:c.text, border:'1px solid '+c.border, fontSize:11 }}
                    >
                      {macro.title}
                    </button>
                  ))}
                </div>
              )}"""

print('found:', src.count(old))
if src.count(old) == 1:
    src = src.replace(old, new)
    open(p, 'w', encoding='utf-8').write(src)
    print('fixed')
else:
    # Show the broken area
    lines = src.splitlines()
    for i,l in enumerate(lines[628:645], start=629):
        print(f'{i}: {repr(l[:100])}')
