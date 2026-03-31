import re
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
src = open(p, encoding='utf-8').read()
src = src.replace('                    tenorKey={TENOR_KEY}\n', '')
src = re.sub(r'const TENOR_KEY[^\n]+\n', '', src)
open(p, 'w', encoding='utf-8').write(src)
print('done, tenor refs remaining:', src.count('TENOR'))
