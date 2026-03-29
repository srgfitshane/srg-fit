export const CLIENT_ACTIVITY_TYPES = [
  { id: 'walk', label: 'Walk', icon: '🚶' },
  { id: 'hike', label: 'Hike', icon: '🥾' },
  { id: 'run', label: 'Run', icon: '🏃' },
  { id: 'bike', label: 'Bike', icon: '🚴' },
  { id: 'cardio', label: 'Cardio', icon: '❤️' },
  { id: 'sport', label: 'Sport', icon: '🏅' },
  { id: 'mobility', label: 'Mobility', icon: '🧘' },
  { id: 'recovery', label: 'Recovery', icon: '🛌' },
  { id: 'other', label: 'Other', icon: '✨' },
] as const

export const CLIENT_ACTIVITY_INTENSITIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'moderate', label: 'Moderate' },
  { id: 'hard', label: 'Hard' },
] as const

export type ClientActivityType = typeof CLIENT_ACTIVITY_TYPES[number]['id']
export type ClientActivityIntensity = typeof CLIENT_ACTIVITY_INTENSITIES[number]['id']

export type ClientActivityRecord = {
  id: string
  client_id: string
  coach_id: string
  activity_date: string
  activity_type: ClientActivityType | string
  title?: string | null
  duration_minutes?: number | null
  distance_value?: number | null
  distance_unit?: string | null
  intensity?: ClientActivityIntensity | string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export const getClientActivityConfig = (type: string | null | undefined) =>
  CLIENT_ACTIVITY_TYPES.find((entry) => entry.id === type) ?? CLIENT_ACTIVITY_TYPES[CLIENT_ACTIVITY_TYPES.length - 1]

export function getClientActivityTitle(activity: Pick<ClientActivityRecord, 'activity_type' | 'title'>) {
  return activity.title?.trim() || getClientActivityConfig(activity.activity_type).label
}

export function formatClientActivityDate(date: string | null | undefined) {
  if (!date) return 'Today'
  return new Date(`${date}T00:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function summarizeClientActivity(activity: Pick<ClientActivityRecord, 'duration_minutes' | 'distance_value' | 'distance_unit' | 'intensity' | 'notes'>) {
  const bits: string[] = []

  if (activity.duration_minutes) {
    bits.push(`${activity.duration_minutes} min`)
  }

  if (activity.distance_value) {
    const unit = activity.distance_unit?.trim() || 'mi'
    bits.push(`${activity.distance_value} ${unit}`)
  }

  if (activity.intensity) {
    bits.push(activity.intensity[0].toUpperCase() + activity.intensity.slice(1))
  }

  if (activity.notes?.trim()) {
    bits.push(activity.notes.trim())
  }

  return bits
}
