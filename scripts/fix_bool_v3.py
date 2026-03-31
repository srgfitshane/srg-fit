
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Fix line 293 - !== false on the METRIC_GROUPS filter
src = src.replace(
    "clientRecord?.show_body_metrics !== false ? METRIC_GROUPS : METRIC_GROUPS.filter(g => g.key === 'weight')",
    "!(clientRecord != null && !clientRecord.show_body_metrics) ? METRIC_GROUPS : METRIC_GROUPS.filter(g => g.key === 'weight')"
)

# Also fix the two remaining !== false guards (lines 229 and 236)
src = src.replace(
    "clientRecord?.show_body_metrics !== false",
    "!(clientRecord != null && !clientRecord.show_body_metrics)"
)

open(p, 'w', encoding='utf-8').write(src)
print('done')
print('remaining !== false:', src.count('!== false'))
