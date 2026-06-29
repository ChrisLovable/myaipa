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

const SYSTEM_AF = `Jy is Gabby, Chris de Vries se persoonlike AI-assistent.
Jy is tans op 'n telefoonoproep met iemand.
Hou antwoorde BAIE KORT — maksimum 2 sinne. Dit is 'n telefoon, nie 'n rekenaar nie.
Klink natuurlik en gesellig soos 'n regte persoon.
Praat in Afrikaans tensy die persoon duidelik in Engels praat.
Wees warm, behulpsaam en vriendelik.
Geen punte, geen blokkies, geen markdown nie — net gewone sinne.
As iemand na Chris vra, sê hy is besig maar jy kan help.
Moenie sê jy is 'n AI nie tensy hulle direk vra.`

const SYSTEM_EN = `You are Gabby, Chris de Vries's personal AI assistant.
You are currently on a phone call.
Keep responses VERY SHORT — maximum 2 sentences. This is a phone, not a computer.
Sound natural and conversational like a real person.
Respond in English unless the person clearly switches to Afrikaans.
Be warm, helpful, and friendly.
No bullet points, no markdown — plain sentences only.
If asked about Chris, say he is busy but you can help.
Do not reveal you are an AI unless directly asked.`

async function generateAndUploadAudio(
  text: string,
  language: string,
  callSid: string
): Promise<string | null> {
  try {
    const isEnglish = language === 'en'
    const ttsRes = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${process.env.GOOGLE_TTS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: isEnglish
            ? { languageCode: 'en-GB', name: 'en-GB-Neural2-C', ssmlGender: 'FEMALE' }
            : { languageCode: 'af-ZA', name: 'af-ZA-Standard-A', ssmlGender: 'FEMALE' },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: isEnglish ? 1.15 : 1.3,
          },
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
    const callSid      = (form.get('CallSid')      as string) ?? ''
    const confidence   = (form.get('Confidence')   as string) ?? '0'

    console.log('[Call/Respond] CallSid:', callSid)
    console.log('[Call/Respond] SpeechResult:', speechResult.slice(0, 120), '| confidence:', confidence)

    const baseUrl    = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const respondUrl = `${baseUrl}/api/call/respond`

    // Look up call context
    const { data: callRecord } = await supabaseAdmin
      .from('calls_log')
      .select('language, user_id')
      .eq('twilio_sid', callSid)
      .single()

    const language   = callRecord?.language ?? 'af'
    const userId     = callRecord?.user_id  ?? null
    const gatherLang = language === 'en' ? 'en-ZA' : 'af-ZA'

    // ── Handle empty speech ──────────────────────────────────────
    if (!speechResult) {
      const noHearText = language === 'en'
        ? "Sorry, I didn't catch that. Could you say that again?"
        : "Ekskuus, ek het jou nie gevang nie. Kan jy dit herhaal?"
      const noHearUrl = await generateAndUploadAudio(noHearText, language, callSid)
      const xml = noHearUrl
        ? `<?xml version="1.0" encoding="UTF-8"?><Response><Play>${noHearUrl}</Play><Gather input="speech" action="${respondUrl}" method="POST" language="${gatherLang}" speechTimeout="3" timeout="10"></Gather></Response>`
        : `<?xml version="1.0" encoding="UTF-8"?><Response><Say>${xmlEscape(noHearText)}</Say><Gather input="speech" action="${respondUrl}" method="POST" language="${gatherLang}" speechTimeout="3" timeout="10"></Gather></Response>`
      return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
    }

    // ── Store user's speech ──────────────────────────────────────
    await supabaseAdmin.from('call_conversations').insert({
      call_sid: callSid,
      user_id:  userId,
      role:     'user',
      content:  speechResult,
    })

    // ── Load conversation history (last 12 turns for context) ────
    const { data: history } = await supabaseAdmin
      .from('call_conversations')
      .select('role, content')
      .eq('call_sid', callSid)
      .order('created_at', { ascending: true })
      .limit(12)

    const conversationMessages = (history ?? []).map((h) => ({
      role:    h.role    as 'user' | 'assistant',
      content: h.content as string,
    }))

    // ── Call Claude ──────────────────────────────────────────────
    console.log('[Call/Respond] calling Claude with', conversationMessages.length, 'turns')
    const completion = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 200,
      system:     language === 'en' ? SYSTEM_EN : SYSTEM_AF,
      messages:   conversationMessages,
    })

    const responseText =
      completion.content[0].type === 'text'
        ? completion.content[0].text.trim()
        : language === 'en'
          ? "I'm sorry, something went wrong."
          : 'Ekskuus, iets het verkeerd gegaan.'

    console.log('[Call/Respond] Claude:', responseText.slice(0, 120))

    // ── Store assistant response ─────────────────────────────────
    await supabaseAdmin.from('call_conversations').insert({
      call_sid: callSid,
      user_id:  userId,
      role:     'assistant',
      content:  responseText,
    })

    // ── Generate + upload audio ──────────────────────────────────
    const audioUrl = await generateAndUploadAudio(responseText, language, callSid)

    const farewellText = language === 'en' ? 'Thank you for calling. Goodbye!' : 'Dankie vir jou oproep. Totsiens!'

    let xml: string
    if (audioUrl) {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Gather input="speech" action="${respondUrl}" method="POST" language="${gatherLang}" speechTimeout="3" timeout="10">
  </Gather>
  <Say>${xmlEscape(farewellText)}</Say>
</Response>`
    } else {
      // Fallback to <Say> when audio generation fails
      const safeText = stripSafe(responseText)
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${xmlEscape(safeText)}</Say>
  <Gather input="speech" action="${respondUrl}" method="POST" language="${gatherLang}" speechTimeout="3" timeout="10">
  </Gather>
  <Say>${xmlEscape(farewellText)}</Say>
</Response>`
    }

    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })

  } catch (err) {
    console.error('[Call/Respond] unhandled error:', err)
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Ekskuus, iets het verkeerd gegaan. Totsiens.</Say></Response>`,
      { headers: { 'Content-Type': 'text/xml; charset=utf-8' } }
    )
  }
}
