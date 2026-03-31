
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()
# Replace the show_body_metrics === false comparisons with a simpler boolean check
src = src.replace(
    'hidden: clientRecord?.show_body_metrics === false',
    'hidden: clientRecord?.show_body_metrics === false || false'
)
# That won't help - need to cast to boolean or use !== true
src = src.replace(
    'hidden: clientRecord?.show_body_metrics === false || false',
    'hidden: clientRecord ? clientRecord.show_body_metrics === false : false'
)
# Also fix the METRIC_GROUPS filter line
src = src.replace(
    'clientRecord?.show_body_metrics !== false ? METRIC_GROUPS',
    "clientRecord ? (clientRecord.show_body_metrics !== false ? METRIC_GROUPS"
)
src = src.replace(
    ": METRIC_GROUPS.filter(g => g.key === 'weight'))",
    ": METRIC_GROUPS.filter(g => g.key === 'weight')) : METRIC_GROUPS)"
)
open(p, 'w', encoding='utf-8').write(src)
print('done')
