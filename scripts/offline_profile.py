
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\clients\[id]\page.tsx'
src = open(p, encoding='utf-8').read()

# 1. Add display_name/client_type to the client type — find the setClient line and add helper
# First add display_name to the select
src = src.replace(
    ".select('*, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)')",
    ".select('*, display_name, client_type, contact_email, contact_phone, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)')"
)

# 2. Fix initials line
src = src.replace(
    "client.profile?.full_name?.split(' ').map((n:string)=>n[0]).join('') || '?'",
    "(client.profile?.full_name || client.display_name || '?').split(' ').map((n:string)=>n[0]).join('')"
)

# 3. Fix main name display line (line 398)
src = src.replace(
    "{client.profile?.full_name}</div>",
    "{client.profile?.full_name || client.display_name || 'Unnamed Client'}</div>",
    1
)

# 4. Hide Resend Invite button for offline clients
src = src.replace(
    "<button onClick={resendInvite} disabled={resending || resendDone}",
    "{client.client_type !== 'offline' && <button onClick={resendInvite} disabled={resending || resendDone}"
)
# Close it — find the closing tag for that button
src = src.replace(
    "{resendDone ? '✓ Sent!' : resending ? 'Sending...' : '📨 Resend Invite'}\n            </button>",
    "{resendDone ? '✓ Sent!' : resending ? 'Sending...' : '📨 Resend Invite'}\n            </button>}"
)

# 5. Fix inline name refs in text
src = src.replace(
    "Set a target for {client?.profile?.full_name}",
    "Set a target for {client?.profile?.full_name || client?.display_name}"
)
src = src.replace(
    "Assign a form to {client?.profile?.full_name} — they'll see it in their client dashboard.",
    "Assign a form to {client?.profile?.full_name || client?.display_name}"
)
src = src.replace(
    "Viewing {client?.profile?.full_name}'s profile",
    "Viewing {client?.profile?.full_name || client?.display_name}'s profile"
)

# 6. Add contact info display for offline clients — find the email display area
# Add contact_email/phone after the name display
src = src.replace(
    "{client.profile?.full_name || client.display_name || 'Unnamed Client'}</div>",
    "{client.profile?.full_name || client.display_name || 'Unnamed Client'}</div>\n                {client.client_type === 'offline' && <div style={{ fontSize:12, color:'#8b5cf6', fontWeight:700, marginTop:2 }}>In-Person Client{client.contact_email ? ' · '+client.contact_email : ''}{client.contact_phone ? ' · '+client.contact_phone : ''}</div>}"
)

open(p, 'w', encoding='utf-8').write(src)
print('done')
print('display_name refs:', src.count('display_name'))
print('client_type refs:', src.count('client_type'))
