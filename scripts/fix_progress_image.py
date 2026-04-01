
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\progress\page.tsx'
src = open(p, encoding='utf-8').read()

# Replace all 3 Image usages with plain img
# Usage 1: grid photo cards
src = src.replace(
    '''                    <div style={{ position:'relative', width:'100%', aspectRatio:'3 / 4' }}>
                      <Image
                        src={p.signedUrl}
                        alt={`${p.angle?.replace('_',' ') || 'Progress'} photo from ${fmt(p.photo_date)}`}
                        fill
                        sizes="(max-width: 768px) 50vw, 140px"
                        style={{ objectFit:'cover', display:'block' }}
                      />''',
    '''                    <div style={{ position:'relative', width:'100%', aspectRatio:'3 / 4' }}>
                      <img
                        src={p.signedUrl}
                        alt={`${p.angle?.replace('_',' ') || 'Progress'} photo from ${fmt(p.photo_date)}`}
                        style={{ objectFit:'cover', display:'block', width:'100%', height:'100%' }}
                      />'''
)

print('usage 1:', src.count('fill\n'))
open(p, 'w', encoding='utf-8').write(src)

# Re-read and do remaining 2
src = open(p, encoding='utf-8').read()
import re
# Replace remaining <Image ... fill ... /> patterns with <img>
# Find lines with <Image and replace block
lines = src.splitlines()
result = []
i = 0
replacements = 0
while i < len(lines):
    if '<Image' in lines[i] and i > 0:
        # Collect the full Image tag block
        block_start = i
        block_lines = [lines[i]]
        i += 1
        while i < len(lines) and '/>' not in lines[i-1]:
            block_lines.append(lines[i])
            i += 1
        block = '\n'.join(block_lines)
        # Extract src and alt
        src_match = re.search(r'src=\{([^}]+)\}', block)
        alt_match = re.search(r'alt=\{([^}]+)\}', block)
        if src_match and alt_match:
            indent = '                        '
            new_tag = f'{indent}<img\n{indent}  src={{{src_match.group(1)}}}\n{indent}  alt={{{alt_match.group(1)}}}\n{indent}  style={{ objectFit:"cover", display:"block", width:"100%", height:"100%", borderRadius:12 }}\n{indent}/>'
            result.append(new_tag)
            replacements += 1
        else:
            result.extend(block_lines)
    else:
        result.append(lines[i])
        i += 1

src2 = '\n'.join(result)
open(p, 'w', encoding='utf-8').write(src2)
print(f'total replacements: {replacements}')
print('remaining <Image:', src2.count('<Image'))
