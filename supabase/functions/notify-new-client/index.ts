import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { requireServiceCaller } from '../_shared/auth.ts'

const COACH_EMAIL = 'shane@srgfit.training'
const SITE_URL    = 'https://srgfit.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const denied = await requireServiceCaller(req, { allowCron: false, headers: corsHeaders })
    if (denied) return denied
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('RESEND_API_KEY not set')

    const { client_name, client_email, plan, source } = await req.json()
    if (!client_name && !client_email) {
      return new Response(JSON.stringify({ error: 'client_name or client_email required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
      })
    }

    const firstName = (client_name || client_email || 'Someone').split(' ')[0]
    const sourceLabel = source === 'stripe' ? 'Stripe checkout (💳 trial started)' : 'Direct invite link'
    const planLabel = plan || 'Standard'
    const now = new Date().toLocaleString('en-US', { timeZone:'America/New_York', month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' })

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080810;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:28px">
    <div style="font-size:26px;font-weight:900;color:#00c9b1">SRG FIT</div>
    <div style="font-size:11px;color:#5a5a78;letter-spacing:.12em;margin-top:2px">NEW CLIENT</div>
  </div>

  <!-- Card -->
  <div style="background:#0f0f1a;border:1px solid #00c9b130;border-radius:16px;padding:28px;text-align:center">
    <div style="font-size:48px;margin-bottom:12px">🎉</div>
    <h2 style="font-size:20px;font-weight:900;color:#eeeef8;margin:0 0 8px">${firstName} just joined!</h2>
    <p style="font-size:13px;color:#8888a8;margin:0 0 24px">You have a new client. Time to make them feel welcome.</p>

    <!-- Details -->
    <div style="background:#161624;border-radius:10px;padding:16px;text-align:left;margin-bottom:24px">
      ${client_name ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #252538"><span style="font-size:12px;color:#5a5a78;font-weight:700">NAME</span><span style="font-size:13px;color:#eeeef8">${client_name}</span></div>` : ''}
      ${client_email ? `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #252538"><span style="font-size:12px;color:#5a5a78;font-weight:700">EMAIL</span><span style="font-size:13px;color:#eeeef8">${client_email}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #252538"><span style="font-size:12px;color:#5a5a78;font-weight:700">PLAN</span><span style="font-size:13px;color:#00c9b1;font-weight:700">${planLabel}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #252538"><span style="font-size:12px;color:#5a5a78;font-weight:700">SOURCE</span><span style="font-size:13px;color:#eeeef8">${sourceLabel}</span></div>
      <div style="display:flex;justify-content:space-between;padding:6px 0"><span style="font-size:12px;color:#5a5a78;font-weight:700">JOINED</span><span style="font-size:13px;color:#eeeef8">${now} ET</span></div>
    </div>

    <a href="${SITE_URL}/dashboard/coach" style="display:inline-block;background:#00c9b1;color:#000;border-radius:12px;padding:13px 32px;font-size:14px;font-weight:900;text-decoration:none">View Dashboard →</a>
  </div>

  <div style="text-align:center;margin-top:24px;font-size:11px;color:#5a5a78">
    SRG Fit · Be Kind to Yourself &amp; Stay Awesome 💪
  </div>
</div>
</body></html>`

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'SRG Fit <info@srg.fitness>',
        to: [COACH_EMAIL],
        subject: `🎉 New client: ${client_name || client_email}`,
        html,
      })
    })

    const result = await res.json()
    console.log('Resend status:', res.status)

    return new Response(JSON.stringify({ success: res.ok }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: res.ok ? 200 : 500
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Unhandled error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }
})
