
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Replace all the === false comparisons with !value checks
src = src.replace(
    "clientRecord?.show_body_metrics === false",
    "!clientRecord?.show_body_metrics"
)
src = src.replace(
    "clientRecord ? (clientRecord.show_body_metrics !== false ? METRIC_GROUPS : METRIC_GROUPS.filter(g => g.key === 'weight')) : METRIC_GROUPS)",
    "clientRecord?.show_body_metrics !== false ? METRIC_GROUPS : METRIC_GROUPS.filter(g => g.key === 'weight'))"
)

open(p, 'w', encoding='utf-8').write(src)
print('done')
print('remaining === false:', src.count('=== false'))
print('show_body_metrics mentions:', src.count('show_body_metrics'))
