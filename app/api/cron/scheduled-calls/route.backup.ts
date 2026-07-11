// Runs periodically (cron-job.org). Handles TWO systems:
// 1. scheduled_calls — simple reminder calls with retry logic
// 2. delegated_tasks — "ask X, report back to Y" two-call chains

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

async function fireOutboundCall(to: string, message: string, summaryPrompt?: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const res = await fetch(`${baseUrl}/api/call/outbound`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, message, summaryPrompt }),
  })
  if (!res.ok) return null
  return res.json()
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const results: Array<Record<string, unknown>> = []

  // ══════════════════════════════════════════════════════
  // SCHEDULED_CALLS: check dialing → fire due pending
  // ══════════════════════════════════════════════════════
  const { data: dialingCalls } = await supabaseAdmin
    .from('scheduled_calls')
    .select('*')
    .eq('status', 'dialing')

  for (const call of dialingCalls ?? []) {
    if (!call.vapi_call_id) continue
    const vapiCall = await checkVapiCallStatus(call.vapi_call_id)
    if (!vapiCall || vapiCall.status !== 'ended') continue

    const endedReason = vapiCall.endedReason || ''
    const isRetryable = RETRYABLE_REASONS.some((r) => endedReason.includes(r))

    if (isRetryable && call.retry_count < call.max_retries) {
      const nextAttempt = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000)
      await supabaseAdmin.from('scheduled_calls').update({
        status: 'pending', scheduled_time: nextAttempt.toISOString(), retry_count: call.retry_count + 1,
      }).eq('id', call.id)
      results.push({ id: call.id, type: 'scheduled_call', action: 'retry_scheduled', endedReason })
    } else if (isRetryable) {
      await supabaseAdmin.from('scheduled_calls').update({ status: 'failed', called_at: new Date().toISOString() }).eq('id', call.id)
      results.push({ id: call.id, type: 'scheduled_call', action: 'retries_exhausted', endedReason })
    } else {
      await supabaseAdmin.from('scheduled_calls').update({ status: 'called', called_at: new Date().toISOString() }).eq('id', call.id)
      results.push({ id: call.id, type: 'scheduled_call', action: 'completed', endedReason })
    }
  }

  const now = new Date().toISOString()
  const { data: dueCalls } = await supabaseAdmin
    .from('scheduled_calls').select('*').eq('status', 'pending').lte('scheduled_time', now)

  for (const call of dueCalls ?? []) {
    const data = await fireOutboundCall(call.phone_number, call.reason)
    if (data) {
      await supabaseAdmin.from('scheduled_calls').update({ status: 'dialing', vapi_call_id: data.id }).eq('id', call.id)
      results.push({ id: call.id, type: 'scheduled_call', action: 'dialing', vapiCallId: data.id })
    } else {
      await supabaseAdmin.from('scheduled_calls').update({ status: 'failed', called_at: new Date().toISOString() }).eq('id', call.id)
      results.push({ id: call.id, type: 'scheduled_call', action: 'fire_failed' })
    }
  }

  // ══════════════════════════════════════════════════════
  // DELEGATED_TASKS: two-call orchestration
  // ══════════════════════════════════════════════════════

  // Phase A: check calls awaiting the target's response — if ended, grab
  // the summary and fire the report-back call to the requester
  const { data: awaitingTasks } = await supabaseAdmin
    .from('delegated_tasks').select('*').eq('status', 'awaiting_target_response')

  for (const task of awaitingTasks ?? []) {
    if (!task.target_call_id) continue
    const vapiCall = await checkVapiCallStatus(task.target_call_id)
    if (!vapiCall || vapiCall.status !== 'ended') continue

    const endedReason = vapiCall.endedReason || ''
    const isRetryable = RETRYABLE_REASONS.some((r) => endedReason.includes(r))

    if (isRetryable) {
      // Target didn't answer — retry the target call shortly
      await supabaseAdmin.from('delegated_tasks').update({
        status: 'pending_target_call', target_call_id: null, updated_at: new Date().toISOString(),
      }).eq('id', task.id)
      results.push({ id: task.id, type: 'delegated_task', action: 'target_retry', endedReason })
      continue
    }

    const answer = vapiCall.analysis?.summary || vapiCall.summary || "They didn't give a clear answer."

    const reportMessage = task.target_name
      ? `You asked me to check with ${task.target_name} about: "${task.question}". Here's what they said: ${answer}`
      : `You asked me to check on: "${task.question}". Here's what they said: ${answer}`

    const reportData = await fireOutboundCall(task.requester_phone, reportMessage)

    if (reportData) {
      await supabaseAdmin.from('delegated_tasks').update({
        status: 'reporting_back', answer_summary: answer, report_call_id: reportData.id, updated_at: new Date().toISOString(),
      }).eq('id', task.id)
      results.push({ id: task.id, type: 'delegated_task', action: 'reporting_back', answer })
    } else {
      await supabaseAdmin.from('delegated_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', task.id)
      results.push({ id: task.id, type: 'delegated_task', action: 'report_fire_failed' })
    }
  }

  // Phase B: check report-back calls — mark completed once ended
  const { data: reportingTasks } = await supabaseAdmin
    .from('delegated_tasks').select('*').eq('status', 'reporting_back')

  for (const task of reportingTasks ?? []) {
    if (!task.report_call_id) continue
    const vapiCall = await checkVapiCallStatus(task.report_call_id)
    if (!vapiCall || vapiCall.status !== 'ended') continue

    await supabaseAdmin.from('delegated_tasks').update({
      status: 'completed', updated_at: new Date().toISOString(),
    }).eq('id', task.id)
    results.push({ id: task.id, type: 'delegated_task', action: 'completed' })
  }

  // Phase C: fire pending target calls (new delegate tasks)
  const { data: pendingTasks } = await supabaseAdmin
    .from('delegated_tasks').select('*').eq('status', 'pending_target_call')

  for (const task of pendingTasks ?? []) {
    const summaryPrompt = `Based on this phone conversation, answer the following question in one clear, concise sentence: "${task.question}". If the person didn't give a clear answer, say so.`
    const askMessage = `Ask them naturally: ${task.question}${task.requester_name ? ` (this is on behalf of ${task.requester_name})` : ''}. Have a brief, warm conversation to get a clear answer.`

    const data = await fireOutboundCall(task.target_phone, askMessage, summaryPrompt)

    if (data) {
      await supabaseAdmin.from('delegated_tasks').update({
        status: 'awaiting_target_response', target_call_id: data.id, updated_at: new Date().toISOString(),
      }).eq('id', task.id)
      results.push({ id: task.id, type: 'delegated_task', action: 'target_dialing', vapiCallId: data.id })
    } else {
      await supabaseAdmin.from('delegated_tasks').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', task.id)
      results.push({ id: task.id, type: 'delegated_task', action: 'target_fire_failed' })
    }
  }

  return NextResponse.json({ results })
}
