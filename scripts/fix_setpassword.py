
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\set-password\page.tsx'
src = open(p, encoding='utf-8').read()

# Add checking state
src = src.replace(
    "  const [sessionOk, setSessionOk] = useState(false)\n  const router",
    "  const [sessionOk, setSessionOk] = useState(false)\n  const [checking,  setChecking]  = useState(true)\n  const router"
)

open(p, 'w', encoding='utf-8').write(src)
print('done, checking count:', src.count('checking'))
