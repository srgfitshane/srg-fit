import sys

path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

hits = []
for i, line in enumerate(lines, 1):
    l = line.lower()
    if 'activit' in l and i > 540:
        hits.append((i, line.rstrip()[:130]))

out = open(r'C:\Users\Shane\OneDrive\Desktop\srg-fit\scripts\activity_hits.txt', 'w', encoding='utf-8')
for i, l in hits:
    out.write(f'{i}: {l}\n')
out.close()
print('done', len(hits), 'hits')
