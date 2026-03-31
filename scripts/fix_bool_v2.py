
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Fix all remaining comparison issues
# Replace clientRecord ? clientRecord.show_body_metrics === false : false
# with clientRecord?.show_body_metrics !== true
src = src.replace(
    'clientRecord ? clientRecord.show_body_metrics === false : false',
    'clientRecord?.show_body_metrics !== true && clientRecord?.show_body_metrics != null'
)
# Fix !== false comparisons too - use === true instead
src = src.replace(
    "clientRecord?.show_body_metrics !== false",
    "clientRecord?.show_body_metrics !== true ? false : true ? "  # wrong - let's do this differently
)

# Reset - use Number coercion approach instead
src2 = open(p, encoding='utf-8').read()
# Replace the hidden checks
src2 = src2.replace(
    'clientRecord ? clientRecord.show_body_metrics === false : false',
    'clientRecord != null && !clientRecord.show_body_metrics'
)
open(p, 'w', encoding='utf-8').write(src2)
print('done')
print('remaining clientRecord ? clientRecord.show_body_metrics:', src2.count('clientRecord ? clientRecord.show_body_metrics'))
