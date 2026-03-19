'use client'

/**
 * Coach Preview — renders the EXACT same client dashboard
 * the client sees, fed by their client record ID.
 *
 * Rule: this file should never contain UI logic.
 * All changes to the client experience live in:
 *   src/app/dashboard/client/page.tsx
 */

import { useParams } from 'next/navigation'
import { ClientDashboardPreview } from '@/app/dashboard/client/page'

export default function CoachPreviewPage() {
  const { clientId } = useParams()
  return <ClientDashboardPreview overrideClientId={clientId as string} />
}
