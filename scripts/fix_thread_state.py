
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()

# The state declarations are missing [thread, setThread]
# Find the state block and add it back at the start
old = "  const [draft,        setDraft]        = useState('')\n  const [sending,      setSending]      = useState(false)"
new = """  const [thread,       setThread]       = useState<Message[]>([])
  const [draft,        setDraft]        = useState('')
  const [sending,      setSending]      = useState(false)"""

print('found:', src.count(old))
src = src.replace(old, new)
open(p, 'w', encoding='utf-8').write(src)
print('done')
