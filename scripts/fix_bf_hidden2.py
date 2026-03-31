
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Find and update the body fat and BF change stat items to add hidden flag
old_bf = "{ label:'Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '\u2014', color:t.orange },"
new_bf = "{ label:'Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '\u2014', color:t.orange, hidden: clientRecord?.show_body_metrics === false },"

old_bfc = "{ label:'BF% Change', val: bfChange ? `${+bfChange>0?'+':''}${bfChange}%` : '\u2014',\n              color: bfChange ? (+bfChange<0?t.green:t.red) : t.textMuted },"
new_bfc = "{ label:'BF% Change', val: bfChange ? `${+bfChange>0?'+':''}${bfChange}%` : '\u2014',\n              color: bfChange ? (+bfChange<0?t.green:t.red) : t.textMuted, hidden: clientRecord?.show_body_metrics === false },"

print('bf found:', src.count(old_bf))
print('bfc found:', src.count(old_bfc))
src = src.replace(old_bf, new_bf)
src = src.replace(old_bfc, new_bfc)
open(p, 'w', encoding='utf-8').write(src)
print('done')
