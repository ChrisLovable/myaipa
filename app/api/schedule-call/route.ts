// Vapi Tool endpoint — called mid-conversation when Gabby detects a scheduling request.
// Configure this URL as a Custom Tool in the Vapi assistant (see setup notes below).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Vapi sends tool calls wrapped in a specific shape
    const toolCallId = body.message?.toolCalls?.[0]?.id ?? body.toolCallId ?? 'unknown'
    const args = body.message?.toolCalls?.[0]?.function?.arguments ?? body.arguments ?? body

    const phoneNumber: string = args.phone_number
    const scheduledTime: string = args.scheduled_time // ISO 8601, e.g. 2026-07-08T12:00:00+02:00
    const reason: string = args.reason

    console.log('[ScheduleCall] request:', { phoneNumber, scheduledTime, reason })

    if (!phoneNumber || !scheduledTime || !reason) {
      return NextResponse.json({
        results: [{
          toolCallId,
          result: 'Missing required info — I need a phone number, a time, and a reason to schedule this.',
        }],
      })
    }

    // Basic sanity check on the date
    const targetDate = new Date(scheduledTime)
    if (isNaN(targetDate.getTime()) || targetDate.getTime() < Date.now()) {
      return NextResponse.json({
        results: [{
          toolCallId,
          result: "That time doesn't look valid or it's in the past — could you confirm the date and time again?",
        }],
      })
    }

    const { error } = await supabaseAdmin.from('scheduled_calls').insert({
      phone_number: phoneNumber,
      scheduled_time: targetDate.toISOString(),
      reason,
      status: 'pending',
    })

    if (error) {
      console.error('[ScheduleCall] DB insert error:', error.message)
      return NextResponse.json({
        results: [{
          toolCallId,
          result: "Sorry, I couldn't save that reminder — something went wrong on my end.",
        }],
      })
    }

    const readableTime = targetDate.toLocaleString('en-ZA', {
      timeZone: 'Africa/Johannesburg',
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'long',
    })

    console.log('[ScheduleCall] saved successfully for', readableTime)

    return NextResponse.json({
      results: [{
        toolCallId,
        result: `Done — I've scheduled a call for ${readableTime} to remind you: ${reason}.`,
      }],
    })
  } catch (err) {
    console.error('[ScheduleCall] unhandled error:', err)
    return NextResponse.json({
      results: [{
        toolCallId: 'unknown',
        result: "Sorry, something went wrong scheduling that.",
      }],
    })
  }
}
