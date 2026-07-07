// Twilio webhook — called when the outbound call connects (person answers).
// Returns TwiML that plays Gabby's greeting then listens for speech.
// No auth required — Twilio POSTs here directly.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function generateAndUploadAudio(text: string, folder: string): Promise<string | null> {
  try {
    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-GB', name: 'en-GB-Neural2-C', ssmlGender: 'FEMALE' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 1.15 },
        }),
      }
    )
    if (!ttsRes.ok) {
      console.error('[TwiML] TTS error:', await ttsRes.text())
      return null
    }
    const ttsData = await ttsRes.json()
    const buffer = Buffer.from(ttsData.audioContent, 'base64')

    const path = `${folder}/${Date.now()}.mp3`
    const { error: upErr } = await supabaseAdmin.storage
      .from('call-audio')
      .upload(path, buffer, { contentType: 'audio/mpeg', upsert: true })
    if (upErr) {
      console.error('[TwiML] upload error:', upErr.message)
      return null
    }

    const { data: urlData } = supabaseAdmin.storage.from('call-audio').getPublicUrl(path)
    return urlData.publicUrl
  } catch (err) {
    console.error('[TwiML] generateAndUpload failed:', err)
    return null
  }
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const callSid    = (form.get('CallSid')    as string) ?? 'unknown'
    const callStatus = (form.get('CallStatus') as string) ?? ''

    // The reminder reason, passed via query string from /api/call/outbound
    const reason = request.nextUrl.searchParams.get('reason') ?? ''

    console.log('[Call/TwiML] CallSid:', callSid, '| CallStatus:', callStatus, '| reason:', reason)

    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const respondUrl = `${baseUrl}/api/call/respond`

    // Look up user for conversation history
    const { data: callRecord } = await supabaseAdmin
      .from('calls_log')
      .select('user_id')
      .eq('twilio_sid', callSid)
      .single()

    const userId = callRecord?.user_id ?? null

    // Personalized greeting: always introduce as Gabby, include the reminder reason if present
    const greetingText = reason
      ? `Hi, this is Gabby calling to remind you: ${reason}.`
      : "Hello! I'm Gabby, your personal AI assistant. How can I help you today?"

    const greetingUrl = await generateAndUploadAudio(greetingText, `greeting/${callSid}`)

    // Store greeting as first assistant turn so respond route has history
    await supabaseAdmin.from('call_conversations').insert({
      call_sid: callSid,
      user_id:  userId,
      role:     'assistant',
      content:  greetingText,
    }).then(({ error }) => {
      if (error) console.error('[Call/TwiML] DB insert error:', error.message)
    })

    const gatherAttrs = `input="speech" action="${respondUrl}" method="POST" language="en-US" speechTimeout="3" timeout="15" enhanced="true"`

    let xml: string
    if (greetingUrl) {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${greetingUrl}</Play>
  <Gather ${gatherAttrs}>
  </Gather>
  <Redirect>${respondUrl}</Redirect>
</Response>`
    } else {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${xmlEscape(greetingText)}</Say>
  <Gather ${gatherAttrs}>
  </Gather>
  <Redirect>${respondUrl}</Redirect>
</Response>`
    }

    console.log('[Call/TwiML] returning TwiML â€” audio:', greetingUrl ? 'Play (Google TTS)' : 'Say (fallback)')
    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })

  } catch (err) {
    console.error('[Call/TwiML] unhandled error:', err)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Hi, this is Gabby. Sorry, I had a small hiccup — how can I help?</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
    )
  }
}
