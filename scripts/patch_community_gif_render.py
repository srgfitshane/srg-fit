path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\community\CommunityFeed.tsx'
src = open(path, encoding='utf-8').read()

# Replace the image render to use plain img for Giphy URLs, Image for stored ones
old = """                    <div style={{ borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                      <Image src={p.image_url} alt="Community post image" width={640} height={320} unoptimized style={{ width:'100%', maxHeight:320, height:'auto', objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>window.open(p.image_url || undefined,'_blank')}/>
                    </div>"""

new = """                    <div style={{ borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                      {p.image_url?.includes('giphy.com') ? (
                        <img src={p.image_url} alt="GIF" style={{ width:'100%', maxHeight:320, objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>window.open(p.image_url || undefined,'_blank')}/>
                      ) : (
                        <Image src={p.image_url!} alt="Community post image" width={640} height={320} unoptimized style={{ width:'100%', maxHeight:320, height:'auto', objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>window.open(p.image_url || undefined,'_blank')}/>
                      )}
                    </div>"""

src = src.replace(old, new, 1)
open(path, 'w', encoding='utf-8').write(src)
print('done')
