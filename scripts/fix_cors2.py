path_nutrition = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\supabase\functions\nutrition-search\index.ts'
path_checkins  = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\supabase\functions\send-weekly-checkins\index.ts'

origin_wildcard = "'Access-Control-Allow-Origin': '*',"
origin_locked   = "'Access-Control-Allow-Origin': 'https://srgfit.app',"

for path in [path_nutrition, path_checkins]:
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    count = content.count(origin_wildcard)
    if count:
        content = content.replace(origin_wildcard, origin_locked, 1)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'FIXED: {path}')
    else:
        print(f'NOT FOUND in: {path}')

# Also add auth check to nutrition-search Edge Function
with open(path_nutrition, 'r', encoding='utf-8') as f:
    content = f.read()

old_serve_block = """serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!FS_CLIENT_ID || !FS_CLIENT_SECRET) {"""

new_serve_block = """serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // Require authenticated user — prevents unauthenticated API quota abuse
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (!FS_CLIENT_ID || !FS_CLIENT_SECRET) {"""

if old_serve_block in content:
    content = content.replace(old_serve_block, new_serve_block, 1)
    with open(path_nutrition, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Auth check added to nutrition-search Edge Function')
else:
    print('serve block not found - showing snippet:')
    idx = content.find('serve(async')
    print(repr(content[idx:idx+300]))
