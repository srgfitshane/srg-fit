// Route-level loading state for coach routes — instant feedback while
// the page chunk downloads. Coach side is dark-only; the root-layout
// theme vars resolve to the dark palette here.
export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Loading...</div>
    </div>
  )
}
