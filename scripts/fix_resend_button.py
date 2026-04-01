
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\clients\[id]\page.tsx'
src = open(p, encoding='utf-8').read()
lines = src.splitlines()

# Find the resendInvite button block (lines 367-370 based on earlier read, 0-indexed = 366-369)
# Replace lines 366-370 (the broken conditional + button)
new_lines = []
i = 0
while i < len(lines):
    l = lines[i]
    if "client.client_type !== 'offline' && <button onClick={resendInvite}" in l:
        # Collect the full button block (until </button>})
        block = [l]
        i += 1
        while i < len(lines) and '</button>' not in lines[i-1] + lines[i]:
            block.append(lines[i])
            i += 1
        # Add the closing line if it has </button>
        if i < len(lines):
            block.append(lines[i])
            i += 1
        # Now rewrite as a proper conditional
        # Extract the full button content
        full = '\n'.join(block)
        # Build proper JSX
        replacement = """          {client.client_type !== 'offline' && (
            <button onClick={resendInvite} disabled={resending || resendDone}
              style={{ background:resendDone?t.greenDim:t.orangeDim, border:'1px solid '+(resendDone?t.green:t.orange)+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:resendDone?t.green:t.orange, cursor:resending||resendDone?'default':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {resendDone ? '✓ Sent!' : resending ? 'Sending...' : '📨 Resend Invite'}
            </button>
          )}"""
        new_lines.append(replacement)
    else:
        new_lines.append(l)
        i += 1

result = '\n'.join(new_lines)
open(p, 'w', encoding='utf-8').write(result)
print('done')
