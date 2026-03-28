import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  void req
  return NextResponse.json(
    { error: 'Legacy create-account flow has been retired in favor of webhook-based provisioning.' },
    { status: 410 }
  )
}
