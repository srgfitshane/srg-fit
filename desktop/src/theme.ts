import type { SemanticColor } from '../../src/lib/coach-inbox'

// Same palette as the web coach page (dark-only). Maps the SemanticColor
// values returned by buildCoachInbox() to concrete hex values for render.
export const t = {
  bg: '#080810',
  surface: '#0f0f1a',
  surfaceUp: '#161624',
  surfaceHigh: '#1d1d2e',
  border: '#252538',
  teal: '#00c9b1',
  tealDim: '#00c9b115',
  orange: '#f5a623',
  orangeDim: '#f5a62315',
  purple: '#8b5cf6',
  purpleDim: '#8b5cf615',
  red: '#ef4444',
  redDim: '#ef444415',
  yellow: '#eab308',
  yellowDim: '#eab30815',
  green: '#22c55e',
  greenDim: '#22c55e15',
  text: '#eeeef8',
  textMuted: '#5a5a78',
  textDim: '#8888a8',
}

export const semanticColorHex: Record<SemanticColor, string> = {
  red: t.red,
  orange: t.orange,
  yellow: t.yellow,
  green: t.green,
  purple: t.purple,
  teal: t.teal,
}

export const queueTypeLabel: Record<
  'review' | 'insight' | 'message' | 'checkin' | 'friction' | 'silent_client',
  string
> = {
  review: 'Review',
  insight: 'Insight',
  message: 'Message',
  checkin: 'Check-in',
  friction: 'Friction',
  silent_client: 'Quiet',
}

export const queueTypeChip = (
  type: 'review' | 'insight' | 'message' | 'checkin' | 'friction' | 'silent_client',
) => {
  switch (type) {
    case 'review':
      return { color: t.red, bg: t.redDim }
    case 'insight':
      return { color: t.purple, bg: t.purpleDim }
    case 'message':
      return { color: t.teal, bg: t.tealDim }
    case 'checkin':
      return { color: t.yellow, bg: t.yellowDim }
    case 'friction':
      return { color: t.orange, bg: t.orangeDim }
    case 'silent_client':
      return { color: t.orange, bg: t.orangeDim }
  }
}
