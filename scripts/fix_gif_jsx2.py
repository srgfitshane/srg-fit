
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()
lines = src.splitlines()

# Fix line 633 (index 632) - replace the broken remnant with the full showMacros block
broken_line = "              )}t, border:'1px solid '+c.border, fontSize:11 }}"
fixed_block = """              )}

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

# Find and replace the broken section
# Lines 633-639 contain the mangled macro block - replace them
new_lines = []
i = 0
while i < len(lines):
    if lines[i].strip().startswith(")}t, border:"):
        # Insert fixed block, skip next 6 broken lines
        new_lines.append(fixed_block)
        i += 7  # skip the broken lines
    else:
        new_lines.append(lines[i])
        i += 1

new_src = '\n'.join(new_lines)
open(p, 'w', encoding='utf-8').write(new_src)
print('done, lines:', len(new_lines))
print('showMacros count:', new_src.count('showMacros'))
