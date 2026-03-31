
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\workout\[sessionId]\page.tsx'
src = open(p, encoding='utf-8').read()
src = src.replace(
    "  const [swapOpen, setSwapOpen] = useState<Record<string,boolean>>({})\n  const [swapReason",
    "  const [swapOpen, setSwapOpen] = useState<Record<string,boolean>>({})\n  const [swapSearch, setSwapSearch] = useState<Record<string,string>>({})\n  const [swapReason"
)
open(p, 'w', encoding='utf-8').write(src)
print('done, swapSearch count:', src.count('swapSearch'))
