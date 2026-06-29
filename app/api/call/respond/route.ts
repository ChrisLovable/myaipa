// Twilio webhook — called after <Gather> captures speech.
// Receives SpeechResult, calls Claude, TTS → Supabase, returns TwiML with <Play>.
// No auth required — Twilio POSTs here directly.

import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_PROMPT = `You are Gabby, Chris de Vries's personal AI assistant on a phone call.
Speak English only.
Keep responses to 2 sentences maximum.
Be warm and conversational.
No bullet points, no markdown — plain sentences only.
If asked about Chris, say he is busy but you can help.
Do not reveal you are an AI unless directly asked.`

async function generateAndUploadAudio(text: string, callSid: string): Promise<string | null> {
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
      console.error('[Call/Respond] TTS HTTP error:', ttsRes.status, await ttsRes.text())
      return null
    }
    const ttsData = await ttsRes.json()
    if (!ttsData.audioContent) {
      console.error('[Call/Respond] TTS returned no audioContent')
      return null
    }
    const buffer = Buffer.from(ttsData.audioContent, 'base64')
    console.log('[Call/Respond] TTS buffer:', buffer.length, 'bytes')

    const path = `${callSid}/${Date.now()}.mp3`
    const { error: upErr } = await supabaseAdmin.storage
      .from('call-audio')
      .upload(path, buffer, { contentType: 'audio/mpeg', upsert: true })
    if (upErr) {
      console.error('[Call/Respond] storage upload error:', upErr.message)
      return null
    }

    const { data: urlData } = supabaseAdmin.storage.from('call-audio').getPublicUrl(path)
    console.log('[Call/Respond] audio URL:', urlData.publicUrl)
    return urlData.publicUrl
  } catch (err) {
    console.error('[Call/Respond] generateAndUpload error:', err)
    return null
  }
}

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function stripSafe(text: string): string {
  return text.replace(/&/g, 'and').replace(/[<>"']/g, '').trim()
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const speechResult = ((form.get('SpeechResult') as string) ?? '').trim()
    const callSid      = (form.get('CallSid')       as string) ?? ''
    const confidence   = (form.get('Confidence')    as string) ?? '0'

    console.log('[Call/Respond] CallSid:', callSid)
    console.log('[Call/Respond] SpeechResult:', speechResult.slice(0, 120), '| confidence:', confidence)

    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const respondUrl = `${baseUrl}/api/call/respond`
    const gatherAttrs = `input="speech" action="${respondUrl}" method="POST" language="en-US" speechTimeout="3" timeout="15" enhanced="true"`

    // Look up user for conversation history
    const { data: callRecord } = await supabaseAdmin
      .from('calls_log')
      .select('user_id')
      .eq('twilio_sid', callSid)
      .single()

    const userId = callRecord?.user_id ?? null

    // ── Handle empty speech — loop back instead of hanging up ────
    if (!speechResult) {
      const noHearText = "Sorry, I didn't catch that. Could you say that again?"
      const noHearUrl  = await generateAndUploadAudio(noHearText, callSid)
      const xml = noHearUrl
        ? `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${noHearUrl}</Play><Gather ${gatherAttrs}></Gather><Redirect>${respondUrl}</Redirect></Response>`
        : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(noHearText)}</Say><Gather ${gatherAttrs}></Gather><Redirect>${respondUrl}</Redirect></Response>`
      return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
    }

    // ── Store user's speech ──────────────────────────────────────
    await supabaseAdmin.from('call_conversations').insert({
      call_sid: callSid,
      user_id:  userId,
      role:     'user',
      content:  speechResult,
    })

    // ── Load last 10 turns for conversation memory ───────────────
    const { data: history } = await supabaseAdmin
      .from('call_conversations')
      .select('role, content')
      .eq('call_sid', callSid)
      .order('created_at', { ascending: true })
      .limit(10)

    const conversationMessages = (history ?? []).map((h) => ({
      role:    h.role    as 'user' | 'assistant',
      content: h.content as string,
    }))

    // ── Call Claude ──────────────────────────────────────────────
    console.log('[Call/Respond] calling Claude with', conversationMessages.length, 'turns')
    const completion = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 200,
      system:     SYSTEM_PROMPT,
      messages:   conversationMessages,
    })

    const responseText =
      completion.content[0].type === 'text'
        ? completion.content[0].text.trim()
        : "I'm sorry, something went wrong. Could you repeat that?"

    console.log('[Call/Respond] Claude:', responseText.slice(0, 120))

    // ── Store assistant response ─────────────────────────────────
    await supabaseAdmin.from('call_conversations').insert({
      call_sid: callSid,
      user_id:  userId,
      role:     'assistant',
      content:  responseText,
    })

    // ── Generate + upload audio ──────────────────────────────────
    const audioUrl = await generateAndUploadAudio(responseText, callSid)

    let xml: string
    if (audioUrl) {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather ${gatherAttrs}>
  </Gather>
  <Redirect>${respondUrl}</Redirect>
</Response>`
    } else {
      // Fallback to <Say> when audio generation fails
      const safeText = stripSafe(responseText)
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${xmlEscape(safeText)}</Say>
  <Gather ${gatherAttrs}>
  </Gather>
  <Redirect>${respondUrl}</Redirect>
</Response>`
    }

    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })

  } catch (err) {
    console.error('[Call/Respond] unhandled error:', err)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, something went wrong. Goodbye.</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
    )
  }
}
