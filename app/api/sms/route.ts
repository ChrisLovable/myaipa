import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { to, message, userId } = await request.json()

    if (!to || !message) {
      return NextResponse.json({ error: 'Nommer en boodskap vereis' }, { status: 400 })
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const fromNumber = process.env.TWILIO_PHONE_NUMBER

    if (!accountSid || !authToken || !fromNumber) {
      return NextResponse.json({ error: 'Twilio nie opgestel nie' }, { status: 500 })
    }

    const client = twilio(accountSid, authToken)

    const msg = await client.messages.create({
      from: fromNumber,
      to,
      body: message,
    })

    // Log to Supabase
    if (userId) {
      await supabaseAdmin.from('calls_log').insert({
        user_id: userId,
        call_type: 'sms',
        to_number: to,
        from_number: fromNumber,
        message,
        twilio_sid: msg.sid,
        status: msg.status,
      })
    }

    return NextResponse.json({
      sid: msg.sid,
      status: msg.status,
      to,
    })
  } catch (err) {
    console.error('SMS error:', err)
    return NextResponse.json(
      { error: 'Iets het verkeerd gegaan. Probeer weer.' },
      { status: 500 }
    )
  }
}
