import re

helper = "\nconst localDateStr = (d: Date = new Date()) =>\n  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`\n"

files = [
    r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx',
    r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\calendar\page.tsx',
]

for p in files:
    src = open(p, encoding='utf-8').read()
    
    # Add helper if not already there
    if 'localDateStr' not in src:
        lines = src.splitlines()
        last_import = 0
        for i, l in enumerate(lines):
            if l.startswith('import '): last_import = i
        lines.insert(last_import + 1, helper)
        src = '\n'.join(lines)
    
    # Replace UTC date patterns with local equivalents
    src = src.replace("new Date().toISOString().split('T')[0]", 'localDateStr()')
    src = src.replace('new Date().toISOString().split("T")[0]', 'localDateStr()')
    src = src.replace("cutoff.toISOString().split('T')[0]", 'localDateStr(cutoff)')
    src = src.replace("d.toISOString().split('T')[0]", 'localDateStr(d)')
    
    open(p, 'w', encoding='utf-8').write(src)
    print(f'Fixed: {p}')
