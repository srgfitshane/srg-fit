import Stripe from 'stripe'

const t = {
  bg:'#080810', surface:'#0f0f1a', border:'#252538',
  teal:'#00c9b1', text:'#eeeef8', textMuted:'#8888a8', textDim:'#8888a8',
}

export const dynamic = 'force-dynamic'

export default async function JoinSuccess({ searchParams }: {
  searchParams: Promise<{ session_id?: string | string[] }>
}) {
  const { session_id: sessionId } = await searchParams
  let confirmed = false
  let trialEnd: string | null = null
  const hasSession = typeof sessionId === 'string' && sessionId.length <= 255 && /^cs_(?:live|test)_[A-Za-z0-9]+$/.test(sessionId)

  if (hasSession) {
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
      confirmed = session.mode === 'subscription' && session.status === 'complete'
        && ['paid', 'no_payment_required'].includes(session.payment_status)
      if (confirmed && session.subscription && typeof session.subscription !== 'string' && session.subscription.status === 'trialing' && session.subscription.trial_end) {
        trialEnd = new Date(session.subscription.trial_end * 1000).toLocaleDateString('en-US', {
          month: 'long', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
        })
      }
    } catch {
      // A completed payment must never be inferred from the URL alone.
      console.error('[join-success] checkout verification failed')
    }
  }

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#080810;}`}</style>
      <div style={{ minHeight:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ maxWidth:480, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:20 }} aria-hidden="true">{confirmed ? '🎉' : '💪'}</div>
          <h1 style={{ fontSize:28, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:12, lineHeight:1.2 }}>
            {confirmed ? 'Checkout confirmed' : 'Check your signup status'}
          </h1>
          <p style={{ fontSize:15, color:t.textMuted, lineHeight:1.7, marginBottom:32 }}>
            {confirmed
              ? 'Your checkout is complete. New members will receive an email to set their password. If you already have an SRG Fit account, sign in with your usual password.'
              : 'We could not confirm a completed checkout from this link. If you just paid, do not pay again. Refresh this page or contact Shane for help.'}
          </p>

          {confirmed && <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:24, marginBottom:24, textAlign:'left' }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:14, color:t.teal }}>What happens next</div>
            {[
              'New here? Check your email and use the setup link to create your password.',
              'Coach Shane will reach out to set up your program.',
              ...(trialEnd ? [`Your trial ends ${trialEnd} (Eastern Time). You can cancel before then in Billing.`] : []),
            ].map((text, index) => (
              <div key={text} style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:'linear-gradient(135deg,#00c9b1,#f5a623)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#000', flexShrink:0 }}>{index + 1}</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.5, paddingTop:3 }}>{text}</div>
              </div>
            ))}
          </div>}

          <a href="/login" style={{ display:'block', padding:14, marginBottom:24, borderRadius:12, background:t.teal, color:'#080810', fontWeight:800, textDecoration:'none' }}>Sign in to SRG Fit</a>
          <div style={{ fontSize:13, color:t.textDim }}>
            Questions? Email <a href="mailto:shane@srgfit.training" style={{ color:t.teal, textDecoration:'none' }}>shane@srgfit.training</a>
          </div>
          <div style={{ marginTop:24, fontSize:11, color:t.textDim }}>Be Kind to Yourself &amp; Stay Awesome 💪</div>
        </div>
      </div>
    </>
  )
}
