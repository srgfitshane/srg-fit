"""
Fix the broken import in coach/clients/[id]/page.tsx.
Remove the rogue "import { alpha } from '@/lib/theme'" line that got
injected inside the multi-line recharts import, and add a proper
import line after that block.
"""
import os, re

f = r"C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\clients\[id]\page.tsx"

with open(f, 'r', encoding='utf-8') as fh:
    content = fh.read()

# 1. Remove the bogus injection — exact line (with leading whitespace if any)
bad = "import {\nimport { alpha } from '@/lib/theme'\n  LineChart"
good = "import {\n  LineChart"

if bad in content:
    content = content.replace(bad, good)
    print("Removed bogus injection")
else:
    print("Bogus pattern not found — file may already be partially fixed")

# 2. Verify alpha is not yet imported anywhere in the head
head = content[:2500]
already_imported = bool(re.search(r"^import\s*\{[^}]*\balpha\b[^}]*\}\s*from\s+['\"]@/lib/theme['\"]", head, re.MULTILINE))
print(f"alpha already imported elsewhere: {already_imported}")

if not already_imported:
    # 3. Add clean import line AFTER the recharts import block (after `} from 'recharts'`)
    pattern = r"(\}\s*from\s+'recharts'\n)"
    if re.search(pattern, content):
        content = re.sub(pattern, r"\1import { alpha } from '@/lib/theme'\n", content, count=1)
        print("Inserted clean alpha import after recharts block")
    else:
        # Fallback: insert after the last top-level import
        # Find all top-level imports
        imports = list(re.finditer(r"^import .+$", content, re.MULTILINE))
        if imports:
            last = imports[-1]
            content = content[:last.end()] + "\nimport { alpha } from '@/lib/theme'" + content[last.end():]
            print(f"Inserted clean alpha import after last import (line near offset {last.end()})")

with open(f, 'w', encoding='utf-8', newline='') as fh:
    fh.write(content)

# 4. Verify
with open(f, 'r', encoding='utf-8') as fh:
    new = fh.read()

# Show first 25 lines
for i, line in enumerate(new.split('\n')[:25], 1):
    print(f"L{i}: {line}")