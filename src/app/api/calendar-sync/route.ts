// POST /api/calendar-sync
// Calendar sync is intentionally disabled until Google Calendar OAuth is wired up.
// Returning a non-success response is safer than claiming an external sync happened.

import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { title, start_at } = await req.json() as { title?: string; start_at?: string }

    if (!title || !start_at) {
      return NextResponse.json({ error: 'title and start_at required' }, { status: 400 })
    }

    return NextResponse.json({
      error: 'Google Calendar sync is not enabled yet. The event can stay inside SRG Fit, but external calendar sync still needs implementation.',
    }, { status: 501 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
