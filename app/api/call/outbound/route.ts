// Outbound call route — powered by Vapi for natural conversational callbacks.
// IMPORTANT: Vapi only supports overriding firstMessage and dynamic {{variables}}
// per call for dashboard-created assistants — NOT the system prompt text itself.
// So the reminder reason is passed as a variable ({{reminder_reason}}) that the
// dashboard system prompt references, with an explicit instruction there never
// to read it aloud verbatim.

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

    const reminderReason = message || ''

    // Generic, natural opener — never includes the raw reason text.
    const firstMessage = "Hi! This is Gabby, calling on Chris's behalf."

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
            is_reminder_call: reminderReason ? true : false,
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
        twilio_sid:  vapiData.id,
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
