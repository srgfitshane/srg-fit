"""
Remove GIF/Tenor feature from RichMessageThread.tsx
Tenor closed new API signups Jan 2026 - remove cleanly
"""
import re

p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()
original_lines = len(src.splitlines())

# 1. Remove TenorGif interface
src = re.sub(r'interface TenorGif \{[^}]+\}\s*', '', src, flags=re.DOTALL)

# 2. Remove tenorKey from props comment
src = src.replace(" *   tenorKey    — Tenor API key for GIF search (optional; GIF button hidden if omitted)\n", "")
src = src.replace(" * Features: text, audio recording, video recording, image/video upload, GIF search, reactions\n",
                  " * Features: text, audio recording, video recording, image/video upload, reactions\n")

# 3. Remove tenorKey from Props interface
src = src.replace("  tenorKey?: string\n", "")

# 4. Remove tenorKey from function params
src = src.replace("{ myId, otherId, otherName, tenorKey, height = '100%', quickReplies = [] }: Props)",
                  "{ myId, otherId, otherName, height = '100%', quickReplies = [] }: Props)")

# 5. Remove GIF state vars
src = src.replace("  const [gifQuery,     setGifQuery]     = useState('')\n", "")
src = src.replace("  const [gifs,         setGifs]         = useState<TenorGif[]>([])\n", "")
src = src.replace("  const [gifLoading,   setGifLoading]   = useState(false)\n", "")

# 6. Remove mode gif from type
src = src.replace("useState<'text'|'audio'|'video'|'gif'>('text')", "useState<'text'|'audio'|'video'>('text')")

# 7. Remove gif from message type check
src = src.replace("['image','video','gif'].includes(msg.message_type)", "['image','video'].includes(msg.message_type)")

# 8. Remove gif_url/gif_preview from Message interface
src = src.replace("  gif_url: string | null\n", "")
src = src.replace("  gif_preview: string | null\n", "")

# 9. Remove searchGifs function and sendGif function
src = re.sub(
    r'  // ── GIF search ─+\n  const searchGifs[^}]+\}\n\n  const sendGif = async.*?notifyRecipient\(.*?\)\n.*?\}\n',
    '', src, flags=re.DOTALL
)

# 10. Remove gif message render
src = re.sub(
    r"\s*if \(msg\.message_type === 'gif'[^}]+\}\s*\n",
    '\n', src, flags=re.DOTALL
)

# 11. Remove GIF CSS classes
src = re.sub(r"\s*\.rmt-gif[^}]+\}\s*", "\n", src, flags=re.DOTALL)
src = re.sub(r"\s*\.rmt-gif-grid[^}]+\}\s*", "\n", src, flags=re.DOTALL)
src = re.sub(r"\s*@media\([^)]+\)\{[^}]*rmt-gif[^}]*\}", "", src, flags=re.DOTALL)

# 12. Remove GIF panel JSX block
src = re.sub(
    r"\s*\{/\* ── GIF search panel ── \*/\}\s*\{mode === 'gif' && \([^)]*?\)\s*\}\s*",
    '\n', src, flags=re.DOTALL
)

# 13. Remove GIF button
src = re.sub(
    r"\s*\{tenorKey && \(\s*<button[^}]+GIF[^)]*\)\s*\}\s*",
    '', src, flags=re.DOTALL
)

# Clean up double blank lines
src = re.sub(r'\n{3,}', '\n\n', src)

open(p, 'w', encoding='utf-8').write(src)
new_lines = len(src.splitlines())
print(f'Done: {original_lines} -> {new_lines} lines (removed {original_lines - new_lines})')
print('gif remaining:', src.lower().count('gif'))
print('tenor remaining:', src.count('tenor'))
