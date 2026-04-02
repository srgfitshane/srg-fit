path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\community\CommunityFeed.tsx'
src = open(path, encoding='utf-8').read()

# 1. Add archived to CommunityPost type
src = src.replace(
    "  pinned?: boolean | null\n  created_at: string",
    "  pinned?: boolean | null\n  archived?: boolean | null\n  created_at: string"
)

# 2. Filter out archived posts in loadPosts query, add showArchived state
src = src.replace(
    "  const [nowMs,        setNowMs]        = useState(() => Date.now())",
    "  const [nowMs,        setNowMs]        = useState(() => Date.now())\n  const [showArchived, setShowArchived] = useState(false)\n  const [coachMenu,    setCoachMenu]    = useState<string|null>(null)"
)

# 3. Filter archived from the posts query
src = src.replace(
    "    .order('pinned', { ascending: false })",
    "    .eq('archived', false)\n      .order('pinned', { ascending: false })"
)

# 4. Add deletePost and archivePost functions before submitReply
src = src.replace(
    "  const submitReply = async (postId: string) => {",
    """  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post? This cannot be undone.')) return
    await supabase.from('community_replies').delete().eq('post_id', postId)
    await supabase.from('community_posts').delete().eq('id', postId)
    await loadPosts()
  }

  const archivePost = async (postId: string, currentArchived: boolean) => {
    await supabase.from('community_posts').update({ archived: !currentArchived }).eq('id', postId)
    await loadPosts()
  }

  const pinPost = async (postId: string, currentPinned: boolean | null) => {
    await supabase.from('community_posts').update({ pinned: !currentPinned }).eq('id', postId)
    await loadPosts()
  }

  const deleteReply = async (replyId: string) => {
    if (!confirm('Delete this reply?')) return
    await supabase.from('community_replies').delete().eq('id', replyId)
    await loadPosts()
  }

  const submitReply = async (postId: string) => {"""
)

open(path, 'w', encoding='utf-8').write(src)
print('done logic')
