// IMPORTANT: For local development, ngrok must be running so Twilio can reach our webhooks.
// 1. In a separate terminal: ngrok http 3000
// 2. Copy the https URL (e.g. https://abc123.ngrok.io)
// 3. Set NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io in .env.local
// 4. Restart Next.js dev server after updating .env.local
// Without ngrok, Twilio cannot POST back to /api/call/twiml or /api/call/respond.

import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { to, message, userId, language } = await request.json()
    console.log('[Call/Outbound] to:', to, '| language:', language, '| userId:', userId)

    if (!to) {
      return NextResponse.json({ error: 'Nommer vereis' }, { status: 400 })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER
    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL

    if (!accountSid || !authToken || !fromNumber) {
      console.error('[Call/Outbound] missing Twilio env vars')
      return NextResponse.json({ error: 'Twilio nie opgestel nie' }, { status: 500 })
    }

    if (!baseUrl || baseUrl.includes('localhost')) {
      console.warn('[Call/Outbound] NEXT_PUBLIC_APP_URL is localhost — Twilio webhooks will fail. Run ngrok and set the public URL.')
    }

    const client = twilio(accountSid, authToken)

    const call = await client.calls.create({
      to,
      from: fromNumber,
      url:                  `${baseUrl}/api/call/twiml`,
      statusCallback:       `${baseUrl}/api/call/status`,
      statusCallbackMethod: 'POST',
    })

    console.log('[Call/Outbound] created — sid:', call.sid, '| status:', call.status)

    if (userId) {
      const { error: dbErr } = await supabaseAdmin.from('calls_log').insert({
        user_id:     userId,
        call_type:   'outbound',
        to_number:   to,
        from_number: fromNumber,
        message:     message || '',
        twilio_sid:  call.sid,
        status:      call.status,
        language:    language || 'af',
      })
      if (dbErr) console.error('[Call/Outbound] DB error:', dbErr.message)
    }

    return NextResponse.json({ success: true, sid: call.sid, status: call.status, to })
  } catch (err) {
    const e = err as Error & { code?: number; moreInfo?: string }
    console.error('[Call/Outbound] Twilio error — code:', e.code, '| message:', e.message, '| moreInfo:', e.moreInfo)
    return NextResponse.json({ error: e.message, code: e.code, moreInfo: e.moreInfo }, { status: 500 })
  }
}
