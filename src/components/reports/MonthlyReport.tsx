import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer'

// Data contract for the monthly report. The /api/reports/monthly route
// assembles this; the PDF component just renders. Keeping these decoupled
// so the design can iterate without touching the data fetcher and vice versa.
export type MonthlyReportData = {
  client_name: string
  coach_name: string
  month_label: string // "April 2026"
  generated_at_label: string // "Apr 29, 2026"
  metrics: {
    weight_start_lbs: number | null
    weight_end_lbs: number | null
    weight_delta_lbs: number | null
  }
  workouts: {
    completed: number
    scheduled: number | null // null when nothing was scheduled
    adherence_pct: number | null
  }
  checkins: {
    completed: number
    total: number | null
  }
  prs: Array<{
    exercise: string
    value: string // formatted: "185 lbs" / "12 reps" etc.
    date_label: string // "Apr 12"
  }>
  photos: {
    before_url: string | null
    after_url: string | null
    before_label: string | null
    after_label: string | null
  }
  highlights: {
    wins: string[] // up to 3 bullets
    struggles: string[] // up to 3 bullets
  }
}

const colors = {
  bg: '#ffffff',
  text: '#0f0f1a',
  textMuted: '#5a5a78',
  textDim: '#8888a8',
  border: '#e6e6f0',
  borderLight: '#f0f0f5',
  teal: '#00a896',
  orange: '#e09422',
  red: '#d83a52',
  green: '#1f9d55',
  surface: '#f7f7fb',
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: colors.bg,
    padding: 36,
    fontSize: 11,
    color: colors.text,
    fontFamily: 'Helvetica',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 22,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: colors.teal,
  },
  brand: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.teal,
    letterSpacing: 1,
  },
  brandSub: {
    fontSize: 9,
    color: colors.textDim,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  reportTitle: {
    fontSize: 11,
    fontWeight: 'bold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  clientName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 4,
  },
  monthLabel: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  // Sections
  section: { marginBottom: 16 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  // Metrics row (3-cell grid)
  metricsRow: { flexDirection: 'row', gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    padding: '10 12',
  },
  metricLabel: {
    fontSize: 9,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  metricSub: {
    fontSize: 9,
    color: colors.textDim,
    marginTop: 2,
  },
  // PRs / lists
  prItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  prLabel: { fontSize: 11, fontWeight: 'bold' },
  prValue: { fontSize: 11, color: colors.teal, fontWeight: 'bold' },
  prDate: { fontSize: 9, color: colors.textDim, marginLeft: 8 },
  // Photos
  photosRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  photoCol: {
    flex: 1,
    alignItems: 'center',
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: 6,
    objectFit: 'cover',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  photoCaption: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  photoEmpty: {
    flex: 1,
    height: 160,
    borderRadius: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoEmptyText: { fontSize: 9, color: colors.textDim },
  // Highlights
  highlightRow: { flexDirection: 'row', gap: 16 },
  highlightCol: { flex: 1 },
  highlightHead: {
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  bullet: {
    fontSize: 10,
    color: colors.text,
    marginBottom: 3,
    lineHeight: 1.4,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: colors.textDim,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
  },
  empty: { fontSize: 10, color: colors.textDim, fontStyle: 'italic' },
})

const deltaColor = (delta: number | null) => {
  if (delta === null) return colors.textDim
  if (delta < 0) return colors.green // assume goal is loss; coach can read context
  if (delta > 0) return colors.orange
  return colors.textDim
}
const deltaArrow = (delta: number | null) => {
  if (delta === null || delta === 0) return ''
  return delta < 0 ? '▼' : '▲'
}

export function MonthlyReport({ data }: { data: MonthlyReportData }) {
  const weightDelta = data.metrics.weight_delta_lbs

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>SRG FIT</Text>
            <Text style={styles.brandSub}>1-on-1 ONLINE COACHING</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.reportTitle}>Monthly Report</Text>
            <Text style={styles.clientName}>{data.client_name}</Text>
            <Text style={styles.monthLabel}>{data.month_label}</Text>
          </View>
        </View>

        {/* Key metrics — 3 cards */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Metrics</Text>
          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Weight</Text>
              <Text style={[styles.metricValue, { color: deltaColor(weightDelta) }]}>
                {weightDelta === null
                  ? '—'
                  : `${deltaArrow(weightDelta)} ${Math.abs(weightDelta).toFixed(1)} lbs`}
              </Text>
              <Text style={styles.metricSub}>
                {data.metrics.weight_start_lbs !== null && data.metrics.weight_end_lbs !== null
                  ? `${data.metrics.weight_start_lbs.toFixed(1)} → ${data.metrics.weight_end_lbs.toFixed(1)} lbs`
                  : 'No weigh-ins logged'}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Workouts</Text>
              <Text style={styles.metricValue}>
                {data.workouts.scheduled !== null
                  ? `${data.workouts.completed} / ${data.workouts.scheduled}`
                  : `${data.workouts.completed}`}
              </Text>
              <Text style={styles.metricSub}>
                {data.workouts.adherence_pct !== null
                  ? `${data.workouts.adherence_pct}% adherence`
                  : 'completed sessions'}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Check-ins</Text>
              <Text style={styles.metricValue}>
                {data.checkins.total !== null
                  ? `${data.checkins.completed} / ${data.checkins.total}`
                  : `${data.checkins.completed}`}
              </Text>
              <Text style={styles.metricSub}>weekly check-ins submitted</Text>
            </View>
          </View>
        </View>

        {/* Personal records */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Records</Text>
          {data.prs.length === 0 ? (
            <Text style={styles.empty}>No PRs logged this month.</Text>
          ) : (
            data.prs.slice(0, 5).map((pr, i) => (
              <View key={i} style={styles.prItem}>
                <View style={{ flexDirection: 'row', flex: 1, alignItems: 'baseline' }}>
                  <Text style={styles.prLabel}>{pr.exercise}</Text>
                  <Text style={styles.prDate}>{pr.date_label}</Text>
                </View>
                <Text style={styles.prValue}>{pr.value}</Text>
              </View>
            ))
          )}
        </View>

        {/* Progress photos */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress</Text>
          <View style={styles.photosRow}>
            <View style={styles.photoCol}>
              {data.photos.before_url ? (
                <>
                  <Image src={data.photos.before_url} style={styles.photo} />
                  <Text style={styles.photoCaption}>Before · {data.photos.before_label}</Text>
                </>
              ) : (
                <View style={styles.photoEmpty}>
                  <Text style={styles.photoEmptyText}>No early-month photo</Text>
                </View>
              )}
            </View>
            <View style={styles.photoCol}>
              {data.photos.after_url ? (
                <>
                  <Image src={data.photos.after_url} style={styles.photo} />
                  <Text style={styles.photoCaption}>After · {data.photos.after_label}</Text>
                </>
              ) : (
                <View style={styles.photoEmpty}>
                  <Text style={styles.photoEmptyText}>No late-month photo</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Highlights */}
        {(data.highlights.wins.length > 0 || data.highlights.struggles.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Highlights</Text>
            <View style={styles.highlightRow}>
              <View style={styles.highlightCol}>
                <Text style={[styles.highlightHead, { color: colors.green }]}>Wins</Text>
                {data.highlights.wins.length === 0 ? (
                  <Text style={styles.empty}>None captured.</Text>
                ) : (
                  data.highlights.wins.slice(0, 3).map((w, i) => (
                    <Text key={i} style={styles.bullet}>{`•  ${w}`}</Text>
                  ))
                )}
              </View>
              <View style={styles.highlightCol}>
                <Text style={[styles.highlightHead, { color: colors.orange }]}>Things to work on</Text>
                {data.highlights.struggles.length === 0 ? (
                  <Text style={styles.empty}>None captured.</Text>
                ) : (
                  data.highlights.struggles.slice(0, 3).map((s, i) => (
                    <Text key={i} style={styles.bullet}>{`•  ${s}`}</Text>
                  ))
                )}
              </View>
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>Generated {data.generated_at_label} · Coach {data.coach_name}</Text>
          <Text>SRG Fit · srgfit.app</Text>
        </View>
      </Page>
    </Document>
  )
}
