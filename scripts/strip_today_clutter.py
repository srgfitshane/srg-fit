path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines 586-728 (0-indexed: 585-727 inclusive)
# These are: priority card, wins plaque, goals, old morning pulse
cleaned = lines[:585] + lines[728:]

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(cleaned)

print(f"Done. Original: {len(lines)} lines, New: {len(cleaned)} lines, Removed: {len(lines)-len(cleaned)}")

# Verify the join looks right
print("--- Line 584:", repr(lines[584].rstrip()))
print("--- Now line 585 (was 729):", repr(cleaned[585].rstrip()))
