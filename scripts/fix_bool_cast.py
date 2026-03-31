
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Replace all show_body_metrics === false with a boolean cast
src = src.replace(
    'clientRecord ? clientRecord.show_body_metrics === false : false',
    'clientRecord?.show_body_metrics === false'
)
# The real fix: cast show_body_metrics to boolean using !!
# Replace the comparisons with a safe boolean check
src = src.replace(
    "clientRecord?.show_body_metrics === false",
    "clientRecord?.show_body_metrics === (false as boolean)"
)

open(p, 'w', encoding='utf-8').write(src)
print('done, count:', src.count('show_body_metrics === (false as boolean)'))
