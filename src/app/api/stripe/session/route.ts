import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { error: 'Session lookup is no longer available on this public route.' },
    { status: 410 }
  )
}
