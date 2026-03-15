// POST /api/calendar-sync
// Creates a Google Calendar event for an AI insight action item
// Requires GOOGLE_CALENDAR_CREDENTIALS env var (service account or OAuth)
// For MVP: stub that returns success — hook in actual GCal OAuth when ready

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { title, description, start_at, end_at } = await req.json()

    if (!title || !start_at) {
      return NextResponse.json({ error: 'title and start_at required' }, { status: 400 })
    }

    // TODO: Wire up Google Calendar OAuth when ready
    // const gcal = await getGoogleCalendarClient()
    // const event = await gcal.events.insert({ calendarId: 'primary', resource: { ... } })

    // For now: return success so the UI flow works cleanly
    // The event is already saved to Supabase calendar_events by the client
    return NextResponse.json({
      success: true,
      message: 'Event saved to SRG Fit calendar. Connect Google Calendar in Settings to sync externally.',
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
