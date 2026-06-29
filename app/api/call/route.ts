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
    console.log('[Call] to:', to, '| language:', language, '| userId:', userId)

    if (!to) {
      return NextResponse.json({ error: 'Nommer vereis' }, { status: 400 })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken  = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER
    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL

    if (!accountSid || !authToken || !fromNumber) {
      console.error('[Call] missing Twilio env vars')
      return NextResponse.json({ error: 'Twilio nie opgestel nie' }, { status: 500 })
    }

    if (!baseUrl || baseUrl.includes('localhost')) {
      console.warn('[Call] NEXT_PUBLIC_APP_URL is localhost — ngrok required for Twilio webhooks')
    }

    const client = twilio(accountSid, authToken)

    // Two-way conversation via webhooks — /api/call/twiml handles the greeting
    // and /api/call/respond handles each speech turn using Claude + Google TTS.
    const call = await client.calls.create({
      to,
      from:                 fromNumber,
      url:                  `${baseUrl}/api/call/twiml`,
      statusCallback:       `${baseUrl}/api/call/status`,
      statusCallbackMethod: 'POST',
    })

    console.log('[Call] created — sid:', call.sid, '| status:', call.status)

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
      if (dbErr) console.error('[Call] DB log error:', dbErr.message)
    }

    return NextResponse.json({
      success: true,
      sid:     call.sid,
      status:  call.status,
      to,
    })
  } catch (err) {
    const e = err as Error & { code?: number; moreInfo?: string }
    console.error('[Call] Twilio error — code:', e.code, '| message:', e.message, '| moreInfo:', e.moreInfo)
    return NextResponse.json(
      { error: e.message, code: e.code, moreInfo: e.moreInfo },
      { status: 500 }
    )
  }
}
