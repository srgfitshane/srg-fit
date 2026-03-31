
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\workout\[sessionId]\page.tsx'
src = open(p, encoding='utf-8').read()
# Bump limit from 250 to 1200 so search covers full library
src = src.replace(
    ".select('id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url')\n        .limit(250)",
    ".select('id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url')\n        .limit(1200)"
)
open(p, 'w', encoding='utf-8').write(src)
print('done, 1200 count:', src.count('.limit(1200)'))
