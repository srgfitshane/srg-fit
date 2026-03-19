'use client'
import CommunityFeed from '@/components/community/CommunityFeed'

export default function CoachCommunityPage() {
  return <CommunityFeed role="coach" backPath="/dashboard/coach" showBottomNav={false} />
}
