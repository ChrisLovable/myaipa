// Runs periodically (triggered by cron-job.org).
// Finds pending scheduled calls that are due and fires them via Vapi.
// Stores vapi_call_id so the webhook can match the outcome back.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Record<string, unknown>[] = []

  // Find all pending calls that are due
  const { data: dueCalls, error: fetchErr } = await supabaseAdmin
    .from('scheduled_calls')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_time', new Date().toISOString())
    .order('scheduled_time', { ascending: true })

  if (fetchErr) {
    console.error('[Cron] fetch error:', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }

  console.log(`[Cron] found ${dueCalls?.length ?? 0} due calls`)

  for (const call of dueCalls ?? []) {
    try {
      // Mark as dialing immediately so next cron run doesn't double-fire
      await supabaseAdmin
        .from('scheduled_calls')
        .update({
          status: 'dialing',
          last_attempt_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', call.id)

      // Fire via Vapi outbound API
      const vapiApiKey = process.env.VAPI_API_KEY
      const vapiAssistantId = process.env.VAPI_ASSISTANT_ID || '3c3a097e-58eb-429d-bee7-e6300e5c88fe'
      const vapiPhoneNumberId = process.env.VAPI_PHONE_NUMBER_ID

      const vapiRes = await fetch('https://api.vapi.ai/call', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${vapiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId: vapiAssistantId,
          phoneNumberId: vapiPhoneNumberId,
          customer: { number: call.phone_number },
          assistantOverrides: {
            firstMessage: "Hi! This is Gabby, calling on Chris's behalf.",
            variableValues: {
              reminder_reason: call.reason,
              is_reminder_call: true,
            },
          },
        }),
      })

      if (!vapiRes.ok) {
        const errText = await vapiRes.text()
        console.error(`[Cron] Vapi error for ${call.phone_number}:`, vapiRes.status, errText)

        const newRetry = (call.retry_count || 0) + 1
        const maxRetries = call.max_retries || 6

        await supabaseAdmin
          .from('scheduled_calls')
          .update({
            status: newRetry >= maxRetries ? 'failed' : 'pending',
            retry_count: newRetry,
            ended_reason: `vapi_api_error_${vapiRes.status}`,
            scheduled_time: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', call.id)

        results.push({ id: call.id, status: 'vapi_error', error: errText })
        continue
      }

      const vapiData = await vapiRes.json()
      console.log(`[Cron] Call placed to ${call.phone_number} â€” vapi_call_id: ${vapiData.id}`)

      // Store vapi_call_id so webhook can match the outcome
      await supabaseAdmin
        .from('scheduled_calls')
        .update({
          vapi_call_id: vapiData.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', call.id)

      results.push({ id: call.id, status: 'dialing', vapi_call_id: vapiData.id })

    } catch (err) {
      console.error(`[Cron] error for call ${call.id}:`, err)
      results.push({ id: call.id, status: 'error', error: (err as Error).message })
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    timestamp: new Date().toISOString(),
  })
}
