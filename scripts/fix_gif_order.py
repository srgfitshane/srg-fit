
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()

# Move gif state vars and gf instance to BEFORE the GIF functions
# Currently gf is declared after the functions that use it - need to move it before

# Remove gf and gif state vars from where they are now
old_gif_state = """  const [gifQuery,     setGifQuery]     = useState('')
  const [gifs,         setGifs]         = useState<any[]>([])
  const [gifLoading,   setGifLoading]   = useState(false)
  const gf = useMemo(() => new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || ''), [])"""

# Add them at the top of state declarations, before the GIF functions
old_comment = "  // GIF search and send"
new_comment = """  const [gifQuery,     setGifQuery]     = useState('')
  const [gifs,         setGifs]         = useState<any[]>([])
  const [gifLoading,   setGifLoading]   = useState(false)
  const gf = useMemo(() => new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || ''), [])

  // GIF search and send"""

print('gif_state found:', src.count(old_gif_state))
print('comment found:', src.count(old_comment))

src = src.replace(old_gif_state, '')
src = src.replace(old_comment, new_comment)
open(p, 'w', encoding='utf-8').write(src)
print('done')
