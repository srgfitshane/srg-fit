path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\community\CommunityFeed.tsx'
src = open(path, encoding='utf-8').read()

# 1. Add GiphyFetch import
src = src.replace(
    "import { resolveSignedMediaUrl } from '@/lib/media'",
    "import { resolveSignedMediaUrl } from '@/lib/media'\nimport { GiphyFetch } from '@giphy/js-fetch-api'",
    1
)

# 2. Add gif state after fileInputRef
src = src.replace(
    "  const fileInputRef = useRef<HTMLInputElement>(null)",
    """  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifUrl,        setGifUrl]        = useState<string|null>(null)
  const [gifQuery,      setGifQuery]      = useState('')
  const [gifs,          setGifs]          = useState<any[]>([])
  const [gifLoading,    setGifLoading]    = useState(false)
  const gf = useMemo(() => new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || ''), [])""",
    1
)

# 3. Add searchGifs and pickGif before post()
src = src.replace(
    "  const post = async () => {",
    """  const searchGifs = async (q: string) => {
    setGifLoading(true)
    try {
      const { data } = q.trim()
        ? await gf.search(q, { limit: 18, rating: 'g' })
        : await gf.trending({ limit: 18, rating: 'g' })
      setGifs(data)
    } catch { setGifs([]) }
    setGifLoading(false)
  }

  const pickGif = (gif: any) => {
    const url = gif.images?.fixed_height?.url || gif.images?.original?.url || ''
    setGifUrl(url)
    setShowGifPicker(false)
    setGifQuery('')
    setGifs([])
    clearMedia()
  }

  const post = async () => {""",
    1
)

# 4. Update the empty check
src = src.replace(
    "    if (!draft.trim() && !mediaFile) return",
    "    if (!draft.trim() && !mediaFile && !gifUrl) return",
    1
)

# 5. Add gifUrl to insert and reset
src = src.replace(
    "      ...(imageUrl && { image_url: imageUrl }),\n      ...(videoUrl && { video_url: videoUrl }),",
    "      ...(imageUrl && { image_url: imageUrl }),\n      ...(gifUrl && !imageUrl && { image_url: gifUrl }),\n      ...(videoUrl && { video_url: videoUrl }),",
    1
)
src = src.replace(
    "    setDraft(''); clearMedia(); setPosting(false); await loadPosts()",
    "    setDraft(''); clearMedia(); setGifUrl(null); setPosting(false); await loadPosts()",
    1
)

open(path, 'w', encoding='utf-8').write(src)
print('done')
