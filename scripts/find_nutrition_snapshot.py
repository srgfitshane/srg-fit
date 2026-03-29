path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
with open(path, encoding='utf-8') as f:
    lines = f.readlines()

hits = []
for i, line in enumerate(lines, 1):
    l = line.lower()
    if 'snapshot' in l or 'nutrition' in l and i > 540:
        hits.append(f'{i}: {line.rstrip()[:130]}')

with open(r'C:\Users\Shane\OneDrive\Desktop\srg-fit\scripts\nutrition_hits.txt', 'w', encoding='utf-8') as f:
    f.write('\n'.join(hits))
print('done', len(hits))
