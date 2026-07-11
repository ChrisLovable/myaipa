// /api/vapi/webhook — receives Vapi end-of-call events
// Updates scheduled_calls with outcome + triggers retry if no answer
// If answered: schedules a callback to Chris with a conversation summary

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// These mean nobody actually picked up and talked
const NO_ANSWER_REASONS = [
  'silence-timed-out',
  'customer-did-not-answer',
  'customer-busy',
  'voicemail',
  'twilio-failed-to-connect-call',
  'assistant-not-found',
  'phone-call-provider-closed-websocket',
]

// These mean a real conversation happened
const ANSWERED_REASONS = [
  'customer-ended-call',
  'assistant-ended-call',
  'assistant-said-end-call-phrase',
  'max-duration-reached',
]

// Minimum call duration (seconds) to count as a real conversation
const MIN_CONVERSATION_DURATION_SEC = 15

const RETRY_DELAY_MINUTES = 10
const CHRIS_NUMBER = '+27766213953'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const eventType = body.message?.type || body.type

    console.log('[Vapi Webhook] Event:', eventType)

    // We only care about end-of-call
    if (eventType !== 'end-of-call-report') {
      return NextResponse.json({ received: true })
    }

    const call = body.message?.call || body.call
    if (!call) {
      console.log('[Vapi Webhook] No call object in payload')
      return NextResponse.json({ received: true })
    }

    const vapiCallId = call.id
    const endedReason = call.endedReason || 'unknown'
    const customerNumber = call.customer?.number
    const startedAt = call.startedAt ? new Date(call.startedAt) : null
    const endedAt = call.endedAt ? new Date(call.endedAt) : null
    const durationSec = startedAt && endedAt
      ? (endedAt.getTime() - startedAt.getTime()) / 1000
      : 0
    const transcript = call.artifact?.transcript || ''

    console.log(`[Vapi Webhook] Call ${vapiCallId} to ${customerNumber} — reason: ${endedReason}, duration: ${durationSec}s`)

    // Find the scheduled_call row by vapi_call_id
    const { data: scheduledCall, error: findErr } = await supabaseAdmin
      .from('scheduled_calls')
      .select('*')
      .eq('vapi_call_id', vapiCallId)
      .single()

    if (findErr || !scheduledCall) {
      console.log(`[Vapi Webhook] No scheduled_call found for vapi_call_id ${vapiCallId} — probably inbound, ignoring`)
      return NextResponse.json({ received: true })
    }

    // Determine outcome
    const wasAnswered = ANSWERED_REASONS.includes(endedReason) && durationSec >= MIN_CONVERSATION_DURATION_SEC
    const wasNoAnswer = NO_ANSWER_REASONS.includes(endedReason) || durationSec < MIN_CONVERSATION_DURATION_SEC

    if (wasAnswered) {
      // SUCCESS — mark as answered
      console.log(`[Vapi Webhook] Call ANSWERED — marking complete. Duration: ${durationSec}s`)
      await supabaseAdmin
        .from('scheduled_calls')
        .update({
          status: 'answered',
          ended_reason: endedReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scheduledCall.id)

      // ─── CALLBACK TO CHRIS WITH SUMMARY ───
      // Only trigger if this is NOT already a callback-to-Chris
      // (prevents infinite loops)
      const isCallbackToChris = customerNumber === CHRIS_NUMBER
      if (!isCallbackToChris) {
        const summaryReason = [
          `You just spoke to ${customerNumber} on behalf of Chris. Now you are calling Chris to report back.`,
          `Open with: "Hi Chris, it's Gabby. I managed to get hold of them — here's how it went."`,
          `Then summarise the key points of the conversation naturally, as if you are a PA debriefing your boss.`,
          `Here is the full transcript of the call you just had:`,
          ``,
          transcript,
          ``,
          `Keep it conversational and warm. Hit the highlights — what they said, how they sounded, anything funny or important.`,
          `If Chris asks follow-up questions, answer from the transcript.`,
          `At the end ask Chris if he wants you to do anything else or call anyone else.`,
          `NEVER read the transcript word for word — summarise it like a human would.`,
        ].join('\n')

        const { error: insertErr } = await supabaseAdmin
          .from('scheduled_calls')
          .insert({
            phone_number: CHRIS_NUMBER,
            scheduled_time: new Date().toISOString(),
            reason: summaryReason,
            max_retries: 6,
            retry_count: 0,
            status: 'pending',
          })

        if (insertErr) {
          console.error('[Vapi Webhook] Failed to schedule callback to Chris:', insertErr.message)
        } else {
          console.log(`[Vapi Webhook] Callback to Chris scheduled — will report on call to ${customerNumber}`)
        }
      }

    } else if (wasNoAnswer) {
      // NO ANSWER — retry or give up
      const newRetryCount = (scheduledCall.retry_count || 0) + 1
      const maxRetries = scheduledCall.max_retries || 6

      if (newRetryCount >= maxRetries) {
        console.log(`[Vapi Webhook] Max retries (${maxRetries}) reached — giving up`)
        await supabaseAdmin
          .from('scheduled_calls')
          .update({
            status: 'max_retries_reached',
            ended_reason: endedReason,
            retry_count: newRetryCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', scheduledCall.id)
      } else {
        const retryTime = new Date(Date.now() + RETRY_DELAY_MINUTES * 60 * 1000)
        console.log(`[Vapi Webhook] No answer — retry ${newRetryCount}/${maxRetries} scheduled for ${retryTime.toISOString()}`)
        await supabaseAdmin
          .from('scheduled_calls')
          .update({
            status: 'pending',
            ended_reason: endedReason,
            retry_count: newRetryCount,
            vapi_call_id: null,
            scheduled_time: retryTime.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', scheduledCall.id)
      }

    } else {
      // Unknown reason
      console.log(`[Vapi Webhook] Unknown endedReason: ${endedReason} — marking as needs_review`)
      await supabaseAdmin
        .from('scheduled_calls')
        .update({
          status: 'needs_review',
          ended_reason: endedReason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', scheduledCall.id)
    }

    return NextResponse.json({ received: true })

  } catch (err) {
    console.error('[Vapi Webhook] Error:', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
