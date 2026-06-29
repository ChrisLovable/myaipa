// Twilio status callback — receives call lifecycle events (ringing, answered, completed, etc.)
// Updates calls_log with final status and duration.
// No auth required — Twilio POSTs here directly.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const form        = await request.formData()
    const callSid     = (form.get('CallSid')      as string) ?? ''
    const callStatus  = (form.get('CallStatus')   as string) ?? ''
    const duration    = (form.get('CallDuration') as string) ?? ''

    console.log('[Call/Status] CallSid:', callSid, '| status:', callStatus, '| duration:', duration, 's')

    const update: Record<string, string | number> = { status: callStatus }
    if (duration) update.duration = parseInt(duration, 10)

    const { error } = await supabaseAdmin
      .from('calls_log')
      .update(update)
      .eq('twilio_sid', callSid)

    if (error) console.error('[Call/Status] DB update error:', error.message)

    return new NextResponse('OK', { status: 200 })
  } catch (err) {
    console.error('[Call/Status] unhandled error:', err)
    return new NextResponse('Error', { status: 500 })
  }
}
