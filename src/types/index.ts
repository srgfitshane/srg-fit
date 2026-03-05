export type UserRole = 'coach' | 'client'

export type Profile = {
  id: string
  email: string
  full_name: string
  role: UserRole
  avatar_url?: string
  created_at: string
}

export type Client = {
  id: string
  profile_id: string
  coach_id: string
  goal_weight?: number
  start_date: string
  program_id?: string
  flagged: boolean
  flag_note?: string
  active: boolean
}
