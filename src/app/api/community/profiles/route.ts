import { NextResponse } from 'next/server'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validIds = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length <= 1000 && value.every(id => typeof id === 'string' && uuid.test(id))

// Community names are shared; account email and billing identifiers are not.
// Derive the group from verified identity, never from a caller-supplied coach ID.
export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('role').eq('id', user.id).maybeSingle()
    if (profileError) throw profileError
    if (profile?.role !== 'coach' && profile?.role !== 'client') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let input: unknown
    try { input = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { authorIds, featuredClientIds } = input as Record<string, unknown>
    if (!validIds(authorIds) || !validIds(featuredClientIds)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    let coachId = user.id
    if (profile.role === 'client') {
      const { data: client, error } = await supabase.from('clients')
        .select('coach_id').eq('profile_id', user.id).maybeSingle()
      if (error) throw error
      if (!client?.coach_id) return NextResponse.json({ error: 'No coaching group found' }, { status: 403 })
      coachId = client.coach_id
    }

    const admin = createAdminClient()
    const { data: members, error: membersError } = await admin.from('clients')
      .select('id, profile_id, display_name').eq('coach_id', coachId)
    if (membersError) throw membersError
    const allowedAuthors = new Set([user.id, coachId, ...(members || []).map(member => member.profile_id)])
    const requestedAuthors = [...new Set([coachId, ...authorIds.filter(id => allowedAuthors.has(id))])]
    const featured = (members || []).filter(member => featuredClientIds.includes(member.id))
    const profileIds = [...new Set([...requestedAuthors, ...featured.map(member => member.profile_id).filter(Boolean)])]
    const { data: names, error: namesError } = await admin.from('profiles')
      .select('id, full_name').in('id', profileIds)
    if (namesError) throw namesError

    const nameMap = new Map((names || []).map(name => [name.id, name.full_name]))
    return NextResponse.json({
      // Explicit projection prevents future SELECT changes from exposing secrets.
      profiles: (names || []).filter(name => requestedAuthors.includes(name.id))
        .map(name => ({ id: name.id, full_name: name.full_name })),
      featuredFirstNames: Object.fromEntries(featured.map(member => [member.id,
        (nameMap.get(member.profile_id) || member.display_name || '').trim().split(/\s+/)[0] || 'a client',
      ])),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Could not load community names. Please try again.' }, { status: 500 })
  }
}
