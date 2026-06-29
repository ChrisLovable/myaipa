import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { to, message, userId } = await request.json()

    console.log('Vapi call request, to:', to)

    const apiKey       = process.env.VAPI_API_KEY?.trim()
    const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID?.trim()
    const assistantId  = process.env.VAPI_ASSISTANT_ID?.trim()

    if (!apiKey || !phoneNumberId || !assistantId) {
      console.error('Missing Vapi credentials')
      return NextResponse.json({ error: 'Vapi not configured' }, { status: 500 })
    }

    // Format SA number to E.164
    let toNumber = to.trim().replace(/\s/g, '')
    if (toNumber.startsWith('0')) {
      toNumber = '+27' + toNumber.substring(1)
    }
    if (!toNumber.startsWith('+')) {
      toNumber = '+' + toNumber
    }

    console.log('Calling via Vapi to:', toNumber)

    const response = await fetch('https://api.vapi.ai/call/phone', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phoneNumberId,
        assistantId,
        customer: {
          number: toNumber,
        },
        assistantOverrides: {
          firstMessage: message || "Hello! I'm Gabby, Chris de Vries's personal AI assistant. How can I help you today?",
        },
      }),
    })

    const data = await response.json()
    console.log('Vapi response:', data)

    if (!response.ok) {
      console.error('Vapi error:', data)
      return NextResponse.json(
        { error: data.message || 'Call failed' },
        { status: 500 }
      )
    }

    // Save to Supabase calls_log
    try {
      const cookieStore = cookies()
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { get: (name) => cookieStore.get(name)?.value } }
      )

      await supabase.from('calls_log').insert({
        user_id:    userId,
        type:       'call',
        to_number:  toNumber,
        message:    message,
        twilio_sid: data.id,
        status:     data.status,
      })
    } catch (dbErr) {
      console.error('DB save error:', dbErr)
    }

    return NextResponse.json({
      success: true,
      callId:  data.id,
      status:  data.status,
      message: `Ek bel nou ${toNumber}. Gabby sal die gesprek hanteer.`,
    })

  } catch (err: unknown) {
    const e = err as Error
    console.error('Call error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
