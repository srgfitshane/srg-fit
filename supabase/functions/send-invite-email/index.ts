import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const denied = await requireServiceCaller(req, { allowCron: false, headers: corsHeaders })
    if (denied) return denied
    const body = await req.json()
    const invite_id = body?.invite_id

    if (!invite_id) {
      return new Response(JSON.stringify({ error: 'invite_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const resendKey = Deno.env.get('RESEND_API_KEY')

    console.log('env check - url:', !!supabaseUrl, 'key:', !!serviceKey, 'resend:', !!resendKey)

    const supabase = createClient(supabaseUrl!, serviceKey!)

    const { data: invite, error: invErr } = await supabase
      .from('client_invites')
      .select('*')
      .eq('id', invite_id)
      .single()

    if (invErr || !invite) {
      console.error('Invite fetch failed')
      return new Response(JSON.stringify({ error: 'Invite not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let coachName = 'Coach Shane'
    try {
      const { data: coach } = await supabase.from('profiles').select('full_name').eq('id', invite.coach_id).single()
      if (coach?.full_name) coachName = coach.full_name
    } catch (_) {}

    const siteUrl = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://srg-fit.vercel.app'
    const inviteUrl = invite.token ? `${siteUrl}/invite/${invite.token}` : `${siteUrl}/login`
    const clientName = invite.full_name ? invite.full_name.split(' ')[0] : 'there'

    if (!resendKey) {
      return new Response(JSON.stringify({ error: 'Invitation email is not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'SRG Fit <noreply@srgfit.training>',
        to: [invite.email],
        subject: `${coachName} invited you to SRG Fit`,
        html: `<div style="font-family:Arial,sans-serif;background:#080810;color:#eeeef8;padding:40px 20px;max-width:520px;margin:0 auto"><div style="text-align:center;margin-bottom:28px"><div style="font-size:28px;font-weight:900;color:#00c9b1">SRG FIT</div><div style="font-size:12px;color:#8888a8;letter-spacing:.1em">STRENGTH. COMPASSION. LEGENDARY SUPPORT.</div></div><div style="background:#0f0f1a;border:1px solid #252538;border-radius:16px;padding:28px;text-align:center"><div style="font-size:40px;margin-bottom:16px">&#128075;</div><h2 style="font-size:20px;font-weight:900;margin-bottom:8px;color:#eeeef8">Hey ${clientName}!</h2><p style="font-size:14px;color:#8888a8;line-height:1.7;margin-bottom:24px"><strong style="color:#00c9b1">${coachName}</strong> has invited you to join SRG Fit &mdash; your personal coaching app.</p>${invite.message ? `<div style="background:rgba(0,201,177,.08);border:1px solid rgba(0,201,177,.2);border-radius:10px;padding:14px;margin-bottom:24px;text-align:left;font-size:13px;color:#8888a8;font-style:italic">&ldquo;${invite.message}&rdquo;</div>` : ''}<a href="${inviteUrl}" style="display:inline-block;background:#00c9b1;border-radius:12px;padding:14px 36px;font-size:15px;font-weight:900;color:#000;text-decoration:none">Accept Invite &rarr;</a><p style="font-size:11px;color:#5a5a78;margin-top:20px">Expires ${new Date(invite.expires_at).toLocaleDateString()}</p></div><p style="text-align:center;font-size:11px;color:#5a5a78;margin-top:20px">If you didn't expect this, ignore this email.</p></div>`
      })
    })

    const result = await res.json()
    console.log('Resend status:', res.status)

    return new Response(JSON.stringify({ success: res.ok, invite_url: inviteUrl, resend_status: res.status, result }), {
      status: res.ok ? 200 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err: any) {
    console.error('Invite email request failed')
    return new Response(JSON.stringify({ error: 'Could not send invitation email' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
