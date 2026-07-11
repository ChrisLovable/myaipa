// Outbound call route â€” powered by Vapi. Supports two modes:
// 1. Simple reminder/message calls (existing behavior)
// 2. Delegate calls â€” pass summaryPrompt to have Vapi extract a structured
//    answer from the conversation afterward (used for delegate_call tasks)

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { to, message, userId, language, summaryPrompt } = await request.json()
    console.log('[Call/Outbound] to:', to, '| message:', message, '| summaryPrompt:', !!summaryPrompt)

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
    const firstMessage = "... Hi! This is Gabby, calling on Chris's behalf."

    const assistantOverrides: Record<string, unknown> = {
      firstMessage,
      variableValues: {
        reminder_reason: reminderReason,
        is_reminder_call: reminderReason ? true : false,
      },
    }

    // If this is a delegate call, ask Vapi to produce a structured summary
    // (the answer to relay back) once the call ends.
    if (summaryPrompt) {
      assistantOverrides.analysisPlan = {
        summaryPlan: {
          enabled: true,
          messages: [
            {
              role: 'system',
              content: summaryPrompt,
            },
          ],
        },
      }
    }

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
        assistantOverrides,
      }),
    })

    if (!vapiRes.ok) {
      const errText = await vapiRes.text()
      console.error('[Call/Outbound] Vapi error:', vapiRes.status, errText)
      return NextResponse.json({ error: 'Vapi call failed', detail: errText }, { status: 500 })
    }

    const vapiData = await vapiRes.json()
    console.log('[Call/Outbound] Vapi call created â€” id:', vapiData.id, '| status:', vapiData.status)

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
