"""
Fix the L2533 bug + sweep for any other (X as Y).color patterns
that the alpha-sweep regex fumbled.
"""
import re

f = r"C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\clients\[id]\page.tsx"
with open(f, "r", encoding="utf-8") as fh:
    content = fh.read()

# Fix L2533 specifically
old = "background:(activeHabitTab as any).alpha(color, 7), border:`1px solid ${(activeHabitTab as any).color}30`"
new = "background:alpha((activeHabitTab as any).color, 7), border:`1px solid ${alpha((activeHabitTab as any).color, 19)}`"

if old in content:
    content = content.replace(old, new)
    print("L2533 patched")
else:
    print("L2533 anchor not found")

# Sweep for any other (EXPR as TYPE).alpha(color, N) patterns — same bug class
pattern = re.compile(r"(\([^)]*as\s+\w+\))\.alpha\(\s*color\s*,\s*(\d+)\s*\)")
matches = list(pattern.finditer(content))
if matches:
    print(f"Found {len(matches)} more (EXPR as TYPE).alpha(color, N) bugs")
    content = pattern.sub(lambda m: f"alpha({m.group(1)}.color, {m.group(2)})", content)

# Same sweep for template-literal form: ${(EXPR as TYPE).color}NN
pattern2 = re.compile(r"\$\{(\([^)]*as\s+\w+\))\.color\}([0-9a-fA-F]{2})(?![0-9a-fA-F])")
matches2 = list(pattern2.finditer(content))
if matches2:
    print(f"Found {len(matches2)} more ${'{'}(EXPR as TYPE).color{'}'}NN template bugs")
    def conv(m):
        expr, hp = m.group(1), m.group(2)
        pct = round(int(hp, 16) / 255 * 100)
        return f"${{alpha({expr}.color, {pct})}}"
    content = pattern2.sub(conv, content)

# Same sweep for concat form: (EXPR as TYPE).color+'XX'
pattern3 = re.compile(r"(\([^)]*as\s+\w+\))\.color\s*\+\s*['\"]([0-9a-fA-F]{2})['\"](?![0-9a-fA-F])")
matches3 = list(pattern3.finditer(content))
if matches3:
    print(f"Found {len(matches3)} more (EXPR as TYPE).color+'XX' concat bugs")
    def conv(m):
        expr, hp = m.group(1), m.group(2)
        pct = round(int(hp, 16) / 255 * 100)
        return f"alpha({expr}.color, {pct})"
    content = pattern3.sub(conv, content)

with open(f, "w", encoding="utf-8", newline="") as fh:
    fh.write(content)

print("Done")