"""
alpha-sweep.py
Convert hex-alpha-suffix patterns to alpha() helper calls across SRG Fit src tree.

Patterns handled:
  EXPR + 'XX'           -> alpha(EXPR, P)
  ${EXPR}XX             -> ${alpha(EXPR, P)}        (inside template literals)
  ' + 'XX'              -> '                        (concatenation suffix)

Where XX is a 2-char hex alpha and P is the resulting integer percentage.

Only matches when EXPR looks like a theme color reference:
  - t.<name>            (e.g. t.teal, t.orange)
  - <name>.color        (e.g. group.color, e.color, item.color)
  - color               (bare identifier)

Reports each change for review. Idempotent (won't double-convert).
"""

import os, re, sys

ROOT = r"C:\Users\Shane\OneDrive\Desktop\srg-fit\src"

FILES = [
    r"app\dashboard\client\calendar\page.tsx",
    r"app\dashboard\client\checkin\page.tsx",
    r"app\dashboard\client\habits\page.tsx",
    r"app\dashboard\client\metrics\page.tsx",
    r"app\dashboard\client\resources\page.tsx",
    r"app\dashboard\client\workout\[sessionId]\page.tsx",
    r"app\dashboard\client\page.tsx",
    r"components\community\CommunityFeed.tsx",
]

def hex_to_pct(hp):
    return round(int(hp, 16) / 255 * 100)

# Color expression: t.X | X.color | sub.color || t.teal | (sub.color||t.teal) etc.
# Keep it conservative: identifier chain ending in .color OR t.IDENT
COLOR_EXPR = r"(?:t\.\w+|\w+(?:\?\.)?\.color(?:\s*\|\|\s*t\.\w+)?|\(\w+(?:\?\.)?\.color\s*\|\|\s*t\.\w+\)|(?<![.\w])color)"

# Pattern A: concatenation form -- EXPR+'XX' or EXPR + 'XX' or EXPR + "XX"
# The alpha hex must be lowercase hex pair 00-ff, 2 chars, NOT followed by another hex digit
PATTERN_CONCAT = re.compile(
    r"(" + COLOR_EXPR + r")"           # group 1: the color expr
    r"\s*\+\s*"                         # +
    r"['\"]([0-9a-fA-F]{2})['\"]"      # group 2: the hex alpha in quotes
    r"(?![0-9a-fA-F])"                  # negative lookahead: not followed by another hex
)

# Pattern B: template literal form -- ${EXPR}XX
PATTERN_TEMPLATE = re.compile(
    r"\$\{(" + COLOR_EXPR + r")\}([0-9a-fA-F]{2})"
    r"(?![0-9a-fA-F])"
)

def convert_concat(m):
    expr, hp = m.group(1), m.group(2)
    pct = hex_to_pct(hp)
    return f"alpha({expr}, {pct})"

def convert_template(m):
    expr, hp = m.group(1), m.group(2)
    pct = hex_to_pct(hp)
    return f"${{alpha({expr}, {pct})}}"

def has_alpha_import(content):
    head = content[:2000]
    return bool(re.search(r"import.*\balpha\b.*from\s+['\"]@/lib/theme['\"]", head, re.DOTALL))

def add_alpha_import(content):
    """Add `alpha` to existing @/lib/theme import, or insert a new import line."""
    # Try to find an existing import from @/lib/theme and add alpha to it
    m = re.search(r"^(import\s*\{)([^}]*)(\}\s*from\s+['\"]@/lib/theme['\"])", content, re.MULTILINE)
    if m:
        names = m.group(2)
        if 'alpha' not in names:
            new_names = names.rstrip() + ", alpha"
            return content[:m.start()] + m.group(1) + new_names + m.group(3) + content[m.end():]
        return content
    # No theme import yet -- add one after the last existing import
    imports = list(re.finditer(r"^import\s+(?:\{[^}]*\}|[\w*\s,]+)\s+from\s+['""][^'""]+['""];?\s*$", content, re.MULTILINE | re.DOTALL))
    if not imports:
        return "import { alpha } from '@/lib/theme'\n" + content
    last = imports[-1]
    insert_pos = last.end()
    return content[:insert_pos] + "\nimport { alpha } from '@/lib/theme'" + content[insert_pos:]

def process_file(path):
    rel = os.path.relpath(path, ROOT)
    with open(path, 'r', encoding='utf-8') as f:
        original = f.read()
    
    # Find all matches first for reporting
    concat_matches = list(PATTERN_CONCAT.finditer(original))
    template_matches = list(PATTERN_TEMPLATE.finditer(original))
    total = len(concat_matches) + len(template_matches)
    
    if total == 0:
        return rel, 0, original
    
    print(f"\n=== {rel}: {total} replacements ===")
    
    # Apply both patterns
    converted = PATTERN_CONCAT.sub(convert_concat, original)
    converted = PATTERN_TEMPLATE.sub(convert_template, converted)
    
    # Ensure alpha is imported
    if not has_alpha_import(converted):
        converted = add_alpha_import(converted)
        print(f"  + added alpha import")
    
    # Show a sample of what changed
    orig_lines = original.split('\n')
    new_lines = converted.split('\n')
    diffs_shown = 0
    for i, (a, b) in enumerate(zip(orig_lines, new_lines)):
        if a != b and diffs_shown < 6:
            print(f"  L{i+1}:")
            print(f"    -- {a.strip()[:160]}")
            print(f"    ++ {b.strip()[:160]}")
            diffs_shown += 1
    if diffs_shown < total:
        print(f"  ({total - diffs_shown} more changes not shown)")
    
    return rel, total, converted

def main():
    grand_total = 0
    files_changed = 0
    pending = []  # (path, new_content)
    
    for rel in FILES:
        path = os.path.join(ROOT, rel)
        if not os.path.isfile(path):
            print(f"SKIP {rel}: not found")
            continue
        rel_path, count, new_content = process_file(path)
        if count > 0:
            grand_total += count
            files_changed += 1
            pending.append((path, new_content))
    
    print(f"\n========================================")
    print(f"Total: {grand_total} replacements across {files_changed} files")
    print(f"========================================")
    
    if "--apply" in sys.argv:
        print("\nApplying changes...")
        for path, content in pending:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(content)
            print(f"  written: {os.path.relpath(path, ROOT)}")
        print("Done.")
    else:
        print("\nDry run only. Pass --apply to write changes.")

if __name__ == "__main__":
    main()