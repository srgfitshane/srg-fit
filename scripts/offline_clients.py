
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\page.tsx'
src = open(p, encoding='utf-8').read()

# 1. Add display_name and client_type to CoachClient type
src = src.replace(
    'type CoachClient = {',
    'type CoachClient = {\n  display_name?: string | null\n  client_type?: string | null\n  contact_email?: string | null\n  contact_phone?: string | null'
)

# 2. Add display_name to select query
src = src.replace(
    '.select(`*, profile:profiles!profile_id(full_name, email, avatar_url)`)',
    '.select(`*, display_name, client_type, contact_email, contact_phone, profile:profiles!profile_id(full_name, email, avatar_url)`)'
)

# 3. Fix name display - fall back to display_name for offline clients
src = src.replace(
    "client.profile?.full_name?.split(' ').map((n) => n[0]).join('') || '?'",
    "(client.profile?.full_name || client.display_name || '?').split(' ').map((n: string) => n[0]).join('')"
)
src = src.replace(
    "{client.profile?.full_name || 'Unkno",
    "{client.profile?.full_name || client.display_name || 'Unkno"
)
src = src.replace(
    "lifecycleClient.profile?.full_name || lifecycleClient.profile?.email || 'this client'",
    "lifecycleClient.profile?.full_name || lifecycleClient.display_name || lifecycleClient.profile?.email || 'this client'"
)

open(p, 'w', encoding='utf-8').write(src)
print('done')
print('display_name refs:', src.count('display_name'))
print('client_type refs:', src.count('client_type'))
