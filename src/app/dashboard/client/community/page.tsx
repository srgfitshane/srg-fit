'use client'
import CommunityFeed from '@/components/community/CommunityFeed'

export default function ClientCommunityPage() {
  return <CommunityFeed role="client" backPath="/dashboard/client?tab=messages" showBottomNav={true} />
}
