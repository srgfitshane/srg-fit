
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\page.tsx'
src = open(p, encoding='utf-8').read()
lines = src.splitlines()

# Remove line 155 (inviting state) and lines 801-839 (modal block)
# Convert to 0-indexed
keep = []
for i, l in enumerate(lines):
    lineno = i + 1
    if lineno == 155:
        continue  # inviting state
    if 801 <= lineno <= 840:
        continue  # invite modal block
    keep.append(l)

result = '\n'.join(keep)
open(p, 'w', encoding='utf-8').write(result)
print('done, remaining refs:')
for k in ['showInvite','inviteEmail','inviteName','handleInvite','inviting','inviteMsg']:
    print(f'  {k}: {result.count(k)}')
