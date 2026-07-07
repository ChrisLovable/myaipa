// Outbound call route — now powered by Vapi instead of raw Twilio + Google TTS.
// This means reminder calls are fully conversational: same voice, same brain,
// same barge-in as inbound calls, and the person can respond, ask questions,
// or reschedule mid-call using the same schedule_call tool.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { to, message, userId, language } = await request.json()
    console.log('[Call/Outbound] to:', to, '| message:', message, '| userId:', userId)

    if (!to) {
      return NextResponse.json({ error: 'Nommer vereis' }, { status: 400 })
    }

    const vapiApiKey        = process.env.VAPI_API_KEY
    const vapiAssistantId   = process.env.VAPI_ASSISTANT_ID
    const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID

    if (!vapiApiKey || !vapiAssistantId || !vapiPhoneNumberId) {
      console.error('[Call/Outbound] missing Vapi env vars')
      return NextResponse.json({ error: 'Vapi nie opgestel nie' }, { status: 500 })
    }

    // Build a natural opening line that includes the reminder reason,
    // but explicitly invites conversation rather than just announcing.
    const reminderReason = message || ''
    const firstMessage = reminderReason
      ? `Hi, this is Gabby calling to remind you: ${reminderReason}. Does that still work for you, or would you like to change anything?`
      : "Hi, this is Gabby calling to check in. How can I help?"

    const vapiRes = await fetch('https://api.vapi.ai/call', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${vapiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        assistantId: vapiAssistantId,
        phoneNumberId: vapiPhoneNumberId,
        customer: { number: to },
        assistantOverrides: {
          firstMessage,
          variableValues: {
            reminder_reason: reminderReason,
            is_reminder_call: true,
          },
        },
      }),
    })

    if (!vapiRes.ok) {
      const errText = await vapiRes.text()
      console.error('[Call/Outbound] Vapi error:', vapiRes.status, errText)
      return NextResponse.json({ error: 'Vapi call failed', detail: errText }, { status: 500 })
    }

    const vapiData = await vapiRes.json()
    console.log('[Call/Outbound] Vapi call created — id:', vapiData.id, '| status:', vapiData.status)

    if (userId) {
      const { error: dbErr } = await supabaseAdmin.from('calls_log').insert({
        user_id:     userId,
        call_type:   'outbound',
        to_number:   to,
        from_number: vapiPhoneNumberId,
        message:     message || '',
        twilio_sid:  vapiData.id, // reusing this column for the Vapi call id
        status:      vapiData.status || 'queued',
        language:    language || 'en',
      })
      if (dbErr) console.error('[Call/Outbound] DB error:', dbErr.message)
    }

    return NextResponse.json({ success: true, id: vapiData.id, status: vapiData.status, to })
  } catch (err) {
    console.error('[Call/Outbound] unhandled error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
