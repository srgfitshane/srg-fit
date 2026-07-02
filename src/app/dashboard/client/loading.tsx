// Route-level loading state: paints instantly on navigation into any
// /dashboard/client/* route while the page chunk downloads, instead of
// leaving the previous screen frozen. Theme vars resolve globally (root
// layout injects them), so this follows light/dark correctly.
export default function Loading() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: "'DM Sans', sans-serif" }}>Loading...</div>
    </div>
  )
}
