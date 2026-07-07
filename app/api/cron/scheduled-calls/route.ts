// Runs periodically (triggered by cron-job.org). Two jobs each run:
// 1. Check on recently-fired calls ("dialing" status) — if busy/no-answer,
//    reschedule a retry (up to max_retries); if connected, mark completed.
// 2. Fire any newly-due pending calls.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const RETRYABLE_REASONS = ['customer-busy', 'no-answer', 'voicemail']
const RETRY_DELAY_MINUTES = 5

async function checkVapiCallStatus(callId: string) {
  const vapiApiKey = process.env.VAPI_API_KEY
  const res = await fetch(`https://api.vapi.ai/call/${callId}`, {
    headers: { Authorization: `Bearer ${vapiApiKey}` },
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: any[] = []

  // ─── PHASE 1: Check on calls that are currently "dialing" ───
  const { data: dialingCalls } = await supabaseAdmin
    .from('scheduled_calls')
    .select('*')
    .eq('status', 'dialing')

  for (const call of dialingCalls ?? []) {
    if (!call.vapi_call_id) continue

    const vapiCall = await checkVapiCallStatus(call.vapi_call_id)
    if (!vapiCall || vapiCall.status !== 'ended') {
      // Still in progress, check again next run
      continue
    }

    const endedReason = vapiCall.endedReason || ''
    const isRetryable = RETRYABLE_REASONS.some((r) => endedReason.includes(r))

    if (isRetryable && call.retry_count < call.max_retries) {
      const nextAttempt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000)
      await supabaseAdmin
        .from('scheduled_calls')
        .update({
          status: 'pending',
          scheduled_time: nextAttempt.toISOString(),
          retry_count: call.retry_count + 1,
        })
        .eq('id', call.id)
      console.log(`[Cron] ${call.id} was ${endedReason} — retry ${call.retry_count + 1}/${call.max_retries} scheduled for ${nextAttempt.toISOString()}`)
      results.push({ id: call.id, action: 'retry_scheduled', endedReason, retryCount: call.retry_count + 1 })
    } else if (isRetryable) {
      // Exhausted retries
      await supabaseAdmin
        .from('scheduled_calls')
        .update({ status: 'failed', called_at: new Date().toISOString() })
        .eq('id', call.id)
      console.log(`[Cron] ${call.id} exhausted retries after ${endedReason}`)
      results.push({ id: call.id, action: 'retries_exhausted', endedReason })
    } else {
      // Connected successfully (or ended for a non-retryable reason)
      await supabaseAdmin
        .from('scheduled_calls')
        .update({ status: 'called', called_at: new Date().toISOString() })
        .eq('id', call.id)
      results.push({ id: call.id, action: 'completed', endedReason })
    }
  }

  // ─── PHASE 2: Fire newly-due pending calls ───
  const now = new Date().toISOString()
  const { data: dueCalls, error } = await supabaseAdmin
    .from('scheduled_calls')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_time', now)

  if (error) {
    console.error('[Cron] fetch error:', error.message)
    return NextResponse.json({ error: error.message, results }, { status: 500 })
  }

  console.log(`[Cron] found ${dueCalls?.length ?? 0} due calls to fire`)

  for (const call of dueCalls ?? []) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
      const res = await fetch(`${baseUrl}/api/call/outbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: call.phone_number,
          message: call.reason,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        await supabaseAdmin
          .from('scheduled_calls')
          .update({ status: 'dialing', vapi_call_id: data.id })
          .eq('id', call.id)
        results.push({ id: call.id, action: 'dialing', vapiCallId: data.id })
      } else {
        await supabaseAdmin
          .from('scheduled_calls')
          .update({ status: 'failed', called_at: new Date().toISOString() })
          .eq('id', call.id)
        results.push({ id: call.id, action: 'fire_failed' })
      }
    } catch (err) {
      console.error(`[Cron] error firing call ${call.id}:`, err)
      await supabaseAdmin
        .from('scheduled_calls')
        .update({ status: 'failed', called_at: new Date().toISOString() })
        .eq('id', call.id)
      results.push({ id: call.id, action: 'fire_error' })
    }
  }

  return NextResponse.json({ checked: dialingCalls?.length ?? 0, fired: dueCalls?.length ?? 0, results })
}
