path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\nutrition-tab.tsx'
with open(path, encoding='utf-8') as f:
    content = f.read()

start = '        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:\'16px 18px\', marginBottom:18 }}>'
end   = '\n        {/* Macro rings */}'

si = content.find(start)
ei = content.find(end, si)

if si == -1: print('START NOT FOUND')
elif ei == -1: print('END NOT FOUND')
else:
    print(f'Removing lines {content[:si].count(chr(10))+1} to {content[:ei].count(chr(10))+1}')
    new_content = content[:si] + '\n        {/* Macro rings */}'  + content[ei + len('\n        {/* Macro rings */}'):]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print('Done')
