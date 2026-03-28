import { requireCoachProfile } from '@/lib/supabase-server'

export default async function CoachLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCoachProfile()
  return children
}
