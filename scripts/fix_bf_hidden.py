
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Add hidden flag to body fat stat cards
old = "            { label:'Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '\\u2014', color:t.orange },"
new = "            { label:'Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '\\u2014', color:t.orange, hidden: clientRecord?.show_body_metrics === false },"
print('bf count:', src.count("{ label:'Body Fat'"))

# Use a simpler approach - filter the stats array
old2 = "          ].map(s => ("
new2 = "          ].filter((s:any) => !s.hidden).map(s => ("

src = src.replace(old2, new2)
print('replaced filter:', src.count('.filter((s:any)'))
open(p, 'w', encoding='utf-8').write(src)
print('done')
