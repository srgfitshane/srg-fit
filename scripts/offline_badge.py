
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\page.tsx'
src = open(p, encoding='utf-8').read()

old = "{client.paused   && <span"
new = "{client.client_type === 'offline' && <span style={{ fontSize:10, fontWeight:800, color:'#8b5cf6', background:'#8b5cf615', border:'1px solid #8b5cf640', borderRadius:4, padding:'1px 6px' }}>In-Person</span>}\n                            {client.paused   && <span"

print('found:', src.count(old))
src = src.replace(old, new, 1)
open(p, 'w', encoding='utf-8').write(src)
print('done')
