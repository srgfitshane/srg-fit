"""
fix-three-files.py
Re-apply all alpha + falsy-zero patches to the three files that got
corrupted by PowerShell encoding errors. Reads/writes UTF-8 explicitly,
preserves line endings.

Three files:
  src/app/dashboard/client/page.tsx                — alpha sweep + 2 gradient fixes + 2 ternary fixes
  src/app/dashboard/client/progress/page.tsx       — alpha sweep
  src/app/dashboard/coach/clients/[id]/page.tsx    — falsy-zero fix on Goals tab

The script is idempotent — safe to run multiple times.
Reports each replacement.
"""

import os, re, sys

ROOT = r"C:\Users\Shane\OneDrive\Desktop\srg-fit\src"

def hex_to_pct(hp):
    return round(int(hp, 16) / 255 * 100)

# Pattern A: concatenation form -- EXPR+'XX' or EXPR + 'XX'
COLOR_EXPR = r"(?:t\.\w+|\w+(?:\?\.)?\.color(?:\s*\|\|\s*t\.\w+)?|\(\w+(?:\?\.)?\.color\s*\|\|\s*t\.\w+\)|color)"

PATTERN_CONCAT = re.compile(
    r"(" + COLOR_EXPR + r")"
    r"\s*\+\s*"
    r"['\"]([0-9a-fA-F]{2})['\"]"
    r"(?![0-9a-fA-F])"
)

# Pattern B: template literal form -- ${EXPR}XX
PATTERN_TEMPLATE = re.compile(
    r"\$\{(" + COLOR_EXPR + r")\}([0-9a-fA-F]{2})"
    r"(?![0-9a-fA-F])"
)

# Pattern C: gradient string concat 'X,'+color+'XX)' — produces ${alpha(color, P)} inline
# This handles: 'linear-gradient(135deg,'+color+','+color+'aa)'
# We rewrite the whole string to a template literal.
PATTERN_GRADIENT_CONCAT = re.compile(
    r"'(linear-gradient\([^']*?,)'\s*\+\s*(\w+)\s*\+\s*',"
    r"'\s*\+\s*\2\s*\+\s*'"
    r"([0-9a-fA-F]{2})\)'"
)

# Pattern D: template literal with logical-OR fallback expression — ${color||t.X}YY
PATTERN_TEMPLATE_FALLBACK = re.compile(
    r"\$\{(\w+\s*\|\|\s*t\.\w+)\}([0-9a-fA-F]{2})"
    r"(?![0-9a-fA-F])"
)

# Pattern E: ternary inside template literal — ${cond ? t.X : t.Y}30 etc.
PATTERN_TEMPLATE_TERNARY = re.compile(
    r"\$\{([^${}]*?\?[^${}]*?:[^${}]*?(?:t\.\w+|\w+))\}([0-9a-fA-F]{2})"
    r"(?![0-9a-fA-F])"
)

def convert_concat(m):
    expr, hp = m.group(1), m.group(2)
    return f"alpha({expr}, {hex_to_pct(hp)})"

def convert_template(m):
    expr, hp = m.group(1), m.group(2)
    return f"${{alpha({expr}, {hex_to_pct(hp)})}}"

def convert_gradient_concat(m):
    prefix, var, hp = m.group(1), m.group(2), m.group(3)
    pct = hex_to_pct(hp)
    return f"`{prefix}${{{var}}},${{alpha({var}, {pct})}})`"

def convert_template_fallback(m):
    expr, hp = m.group(1), m.group(2)
    return f"${{alpha({expr}, {hex_to_pct(hp)})}}"

def convert_template_ternary(m):
    expr, hp = m.group(1), m.group(2)
    return f"${{alpha({expr}, {hex_to_pct(hp)})}}"

def has_alpha_import(content):
    head = content[:2000]
    return bool(re.search(r"import.*\balpha\b.*from\s+['\"]@/lib/theme['\"]", head, re.DOTALL))

def add_alpha_import(content):
    m = re.search(r"^(import\s*\{)([^}]*)(\}\s*from\s+['\"]@/lib/theme['\"])", content, re.MULTILINE)
    if m:
        names = m.group(2)
        if 'alpha' not in names:
            new_names = names.rstrip() + ", alpha"
            return content[:m.start()] + m.group(1) + new_names + m.group(3) + content[m.end():]
        return content
    imports = list(re.finditer(r"^import .+$", content, re.MULTILINE))
    if not imports:
        return "import { alpha } from '@/lib/theme'\n" + content
    last = imports[-1]
    insert_pos = last.end()
    return content[:insert_pos] + "\nimport { alpha } from '@/lib/theme'" + content[insert_pos:]

def process_alpha_file(path):
    """Run all alpha conversions."""
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    counts = {'concat':0, 'template':0, 'gradient':0, 'fallback':0, 'ternary':0}
    
    new_content, n = PATTERN_GRADIENT_CONCAT.subn(convert_gradient_concat, content)
    counts['gradient'] = n
    
    new_content, n = PATTERN_TEMPLATE_FALLBACK.subn(convert_template_fallback, new_content)
    counts['fallback'] = n
    
    new_content, n = PATTERN_TEMPLATE_TERNARY.subn(convert_template_ternary, new_content)
    counts['ternary'] = n
    
    new_content, n = PATTERN_CONCAT.subn(convert_concat, new_content)
    counts['concat'] = n
    
    new_content, n = PATTERN_TEMPLATE.subn(convert_template, new_content)
    counts['template'] = n
    
    total = sum(counts.values())
    if total > 0 and not has_alpha_import(new_content):
        new_content = add_alpha_import(new_content)
        print(f"  + added alpha import")
    
    if total > 0:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(new_content)
    
    rel = os.path.relpath(path, ROOT)
    print(f"  {rel}: total={total} ({counts})")
    return total

def fix_falsy_zero(path):
    """In coach/clients/[id]/page.tsx, change goal.current_value truthy to != null."""
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Edit 1: pct calc -- match the multi-line ternary
    # Already-fixed safety: only do if we see the truthy form
    pat1 = re.compile(
        r"(const pct = goal\.target_value && goal\.current_value)(\s*\n\s*\?)"
    )
    new_content, n1 = pat1.subn(r"\1 != null\2", content)
    
    # Edit 2: "Now:" display
    pat2 = re.compile(
        r"\{goal\.current_value \? <>"
    )
    new_content, n2 = pat2.subn(r"{goal.current_value != null ? <>", new_content)
    
    if n1 > 0 or n2 > 0:
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(new_content)
    
    rel = os.path.relpath(path, ROOT)
    print(f"  {rel}: falsy-zero fixes={n1 + n2} (pct={n1}, now-display={n2})")
    return n1 + n2

def main():
    print("=== Re-applying alpha conversions to 3 corrupted files ===")
    files = [
        os.path.join(ROOT, "app", "dashboard", "client", "page.tsx"),
        os.path.join(ROOT, "app", "dashboard", "client", "progress", "page.tsx"),
        os.path.join(ROOT, "app", "dashboard", "coach", "clients", "[id]", "page.tsx"),
    ]
    
    grand = 0
    for f in files:
        if not os.path.isfile(f):
            print(f"SKIP missing: {f}")
            continue
        grand += process_alpha_file(f)
    
    print()
    print("=== Applying falsy-zero fix to coach/clients/[id]/page.tsx ===")
    coach = os.path.join(ROOT, "app", "dashboard", "coach", "clients", "[id]", "page.tsx")
    grand += fix_falsy_zero(coach)
    
    print()
    print(f"Total replacements: {grand}")

if __name__ == "__main__":
    main()