
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\programs\[id]\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# The duplicate orphaned modal starts after CalendarView's closing }
# Find the last occurrence of the open slot modal marker
marker = '\n      {saving && (\n        <div style={{ position:\'fixed\', bottom:20, right:20'

occurrences = []
start = 0
while True:
    idx = content.find(marker, start)
    if idx == -1:
        break
    occurrences.append(idx)
    start = idx + 1

print(f"Found {len(occurrences)} occurrences of saving block at positions:", occurrences)

if len(occurrences) == 2:
    # Remove the second one (the orphaned duplicate)
    # Find what comes after the second occurrence to determine end
    second = occurrences[1]
    # The orphaned block ends with the last line of the file or a specific marker
    # It should end at the very end of the file
    # Find the closing </> or end of the orphaned block
    orphan_end = content.find('\n    </div>', second)
    if orphan_end == -1:
        orphan_end = len(content)
    else:
        orphan_end += len('\n    </div>')
    
    print(f"Removing from {second} to {orphan_end}")
    print("Removing:", repr(content[second:second+100]))
    
    new_content = content[:second] + content[orphan_end:]
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Done.", len(new_content), "chars")
else:
    print("Expected 2, got", len(occurrences))
