import re
path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\supabase\functions\generate-ai-insight\index.ts'
with open(path, encoding='utf-8') as f:
    content = f.read()
tables = re.findall(r"\.from\(['\"](\w+)['\"]", content)
print('Tables queried:', sorted(set(tables)))
print('Total lines:', content.count('\n'))
