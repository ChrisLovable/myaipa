import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function normalizeSouthAfricanPhone(value: unknown): string {
  const raw = String(value ?? '').trim()
  const cleaned = raw.replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+27')) return cleaned
  if (cleaned.startsWith('27')) return `+${cleaned}`
  if (cleaned.startsWith('0')) return `+27${cleaned.slice(1)}`

  return cleaned
}

export async function POST(request: NextRequest) {
  let toolCallId = 'unknown'

  try {
    const body = await request.json()

    toolCallId =
      body.message?.toolCalls?.[0]?.id ??
      body.toolCallId ??
      'unknown'

    const rawArgs =
      body.message?.toolCalls?.[0]?.function?.arguments ??
      body.arguments ??
      body

    const args =
      typeof rawArgs === 'string'
        ? JSON.parse(rawArgs)
        : rawArgs

    const targetPhone = normalizeSouthAfricanPhone(args.target_phone)
    const requesterPhone = normalizeSouthAfricanPhone(args.requester_phone)

    const targetName =
      typeof args.target_name === 'string'
        ? args.target_name.trim()
        : null

    const requesterName =
      typeof args.requester_name === 'string'
        ? args.requester_name.trim()
        : null

    const taskType =
      typeof args.task_type === 'string' && args.task_type.trim()
        ? args.task_type.trim()
        : 'general'

    const taskInstruction =
      typeof args.task_instruction === 'string'
        ? args.task_instruction.trim()
        : ''

    const reportBack =
      typeof args.report_back === 'boolean'
        ? args.report_back
        : true

    const scheduledTime =
      args.scheduled_time
        ? new Date(args.scheduled_time)
        : new Date()

    console.log('[DelegateCall] request:', {
      targetPhone,
      targetName,
      requesterPhone,
      requesterName,
      taskType,
      taskInstruction,
      reportBack,
      scheduledTime: scheduledTime.toISOString(),
    })

    if (!targetPhone || !requesterPhone || !taskInstruction) {
      return NextResponse.json({
        results: [
          {
            toolCallId,
            result: JSON.stringify({
              success: false,
              error:
                'Missing required information. I need the target phone number, requester phone number, and task instruction.',
            }),
          },
        ],
      })
    }

    const e164Pattern = /^\+[1-9]\d{7,14}$/

    if (
      !e164Pattern.test(targetPhone) ||
      !e164Pattern.test(requesterPhone)
    ) {
      return NextResponse.json({
        results: [
          {
            toolCallId,
            result: JSON.stringify({
              success: false,
              error:
                'One of the phone numbers is invalid. Please provide a valid phone number.',
            }),
          },
        ],
      })
    }

    if (Number.isNaN(scheduledTime.getTime())) {
      return NextResponse.json({
        results: [
          {
            toolCallId,
            result: JSON.stringify({
              success: false,
              error:
                'The scheduled time is invalid. Please confirm the date and time.',
            }),
          },
        ],
      })
    }

    const { data, error } = await supabaseAdmin
      .from('delegated_calls')
      .insert({
        requester_phone: requesterPhone,
        requester_name: requesterName,
        target_phone: targetPhone,
        target_name: targetName,
        task_type: taskType,
        task_instruction: taskInstruction,
        report_back: reportBack,
        scheduled_time: scheduledTime.toISOString(),
        status: 'pending',
      })
      .select(
        'id, target_phone, target_name, requester_phone, task_type, scheduled_time, status'
      )
      .single()

    if (error) {
      console.error('[DelegateCall] database error:', error)

      return NextResponse.json({
        results: [
          {
            toolCallId,
            result: JSON.stringify({
              success: false,
              error: 'The delegated call could not be saved.',
            }),
          },
        ],
      })
    }

    console.log('[DelegateCall] created:', data.id)

    return NextResponse.json({
      results: [
        {
          toolCallId,
          result: JSON.stringify({
            success: true,
            delegation_id: data.id,
            status: data.status,
            target_phone: data.target_phone,
            target_name: data.target_name,
            scheduled_time: data.scheduled_time,
            message:
              'The delegated call has been saved and will be processed.',
          }),
        },
      ],
    })
  } catch (error) {
    console.error('[DelegateCall] unexpected error:', error)

    return NextResponse.json({
      results: [
        {
          toolCallId,
          result: JSON.stringify({
            success: false,
            error: 'An unexpected error occurred while creating the delegated call.',
          }),
        },
      ],
    })
  }
}
