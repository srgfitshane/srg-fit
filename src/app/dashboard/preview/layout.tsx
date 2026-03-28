import { requireCoachProfile } from '@/lib/supabase-server'

export default async function PreviewLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireCoachProfile()
  return children
}
