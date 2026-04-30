// Local YYYY-MM-DD for any Postgres date column (logged_date, checkin_date,
// log_date, scheduled_date, photo_date, start_date, etc.). NEVER use
// toISOString().split('T')[0] for these -- toISOString returns UTC and at
// 8pm ET that drifts to tomorrow's date, so writes land on the wrong day
// and reads miss today's rows. Same Rule 7 issue caught Shane's metrics
// saves until Apr 29, 2026.

export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
