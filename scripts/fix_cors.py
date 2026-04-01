path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\supabase\functions\generate-ai-insight\index.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = "'Access-Control-Allow-Origin': '*',"
new = "'Access-Control-Allow-Origin': 'https://srgfit.app',"

count = content.count(old)
print(f"Found {count} occurrence(s)")

if count >= 1:
    content = content.replace(old, new, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('DONE')
else:
    print('NOT FOUND - showing first 200 chars of corsHeaders block:')
    idx = content.find('corsHeaders')
    print(repr(content[idx:idx+200]))
