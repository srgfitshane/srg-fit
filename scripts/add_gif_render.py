
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()

old = "    return <span style={{ fontSize:14, lineHeight:1.55, wordBreak:'break-word' }}>{msg.body}</span>\n  }\n  const groupReactions"
new = """    if (msg.message_type === 'gif' && msg.gif_url) {
      return (
        <img src={msg.gif_url} alt={msg.body || 'GIF'}
          style={{ maxWidth:'100%', width:'240px', borderRadius:10, display:'block', cursor:'pointer' }}
          onClick={()=>window.open(msg.gif_url,'_blank')}
        />
      )
    }
    return <span style={{ fontSize:14, lineHeight:1.55, wordBreak:'break-word' }}>{msg.body}</span>
  }
  const groupReactions"""

print('found:', src.count(old))
src = src.replace(old, new)
open(p, 'w', encoding='utf-8').write(src)
print('done')
