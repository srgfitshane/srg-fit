
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\messaging\RichMessageThread.tsx'
src = open(p, encoding='utf-8').read()
src = src.replace(
    "import { resolveSignedMediaUrl } from '@/lib/media'",
    "import { resolveSignedMediaUrl } from '@/lib/media'\nimport { GiphyFetch } from '@giphy/js-fetch-api'"
)
open(p, 'w', encoding='utf-8').write(src)
print('done')
