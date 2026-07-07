// Twilio WhatsApp webhook — called when a WhatsApp message/voice note arrives.
// No auth required — Twilio POSTs here directly (sandbox or production sender).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GABBY_SYSTEM_PROMPT = `You are Gabby, a friendly South African AI personal assistant from myAIpa.

RULES:
- Keep answers SHORT - 1 to 2 sentences maximum. This is a WhatsApp voice note reply.
- Be warm, natural and helpful. Sound like a real person, not a robot.
- NEVER make up information. If you don't know, say so honestly.
- Ask one question at a time.

CRITICAL - NO FABRICATED ACTIONS:
- You currently have NO ability to send, create, or do anything. You can only chat.
- NEVER say you have sent, created, booked, or done something. You cannot.
- If someone asks you to do something, say honestly: I can't do that yet, but it's coming soon.`

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Download Twilio media (requires Basic Auth) ──────────────────────
async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const res = await fetch(mediaUrl, {
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64'),
    },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Media download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ── Transcribe via ElevenLabs Scribe ─────────────────────────────────
async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const form = new FormData()
  form.append('file', new Blob([audioBuffer], { type: 'audio/ogg' }), 'voice.ogg')
  form.append('model_id', 'scribe_v1')
  // No language forced — Scribe auto-detects (handles both English and Afrikaans)

  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
    body: form,
  })

  if (!res.ok) {
    console.error('[WhatsApp] Scribe error:', await res.text())
    throw new Error(`Transcription failed: ${res.status}`)
  }

  const data = await res.json()
  return data.text ?? ''
}

// ── Ask Gabby (Claude) ────────────────────────────────────────────────
async function askGabby(userMessage: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: GABBY_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  })

  if (!response.ok) {
    console.error('[WhatsApp] Claude error:', await response.text())
    throw new Error('Gabby brain failed')
  }

  const result = await response.json()
  return result.content?.[0]?.text ?? "Sorry, I didn't catch that."
}

// ── TTS via ElevenLabs (Flash first, multilingual fallback) — matches /api/tts ──
async function synthesizeElevenLabs(text: string, modelId: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY!
  const voiceId = process.env.ELEVENLABS_VOICE_ID!

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  })

  console.log(`[WhatsApp TTS] ${modelId} status:`, response.status)
  if (!response.ok) {
    console.error(`[WhatsApp TTS] ${modelId} error:`, await response.text())
    return null
  }
  return response.arrayBuffer()
}

async function textToSpeechAndUpload(text: string, folder: string): Promise<string | null> {
  let audioBuffer = await synthesizeElevenLabs(text, 'eleven_flash_v2_5')
  if (!audioBuffer) {
    console.log('[WhatsApp TTS] Flash failed — falling back to eleven_multilingual_v2')
    audioBuffer = await synthesizeElevenLabs(text, 'eleven_multilingual_v2')
  }
  if (!audioBuffer || audioBuffer.byteLength < 100) return null

  const buffer = Buffer.from(audioBuffer)
  const path = `${folder}/${Date.now()}.mp3`

  const { error: upErr } = await supabaseAdmin.storage
    .from('whatsapp-audio')
    .upload(path, buffer, { contentType: 'audio/mpeg', upsert: true })

  if (upErr) {
    console.error('[WhatsApp] storage upload error:', upErr.message)
    return null
  }

  const { data: urlData } = supabaseAdmin.storage.from('whatsapp-audio').getPublicUrl(path)
  return urlData.publicUrl
}

// ── Main webhook ──────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData()
    const from = (form.get('From') as string) ?? ''
    const body = ((form.get('Body') as string) ?? '').trim()
    const numMedia = parseInt((form.get('NumMedia') as string) ?? '0')
    const mediaType = (form.get('MediaContentType0') as string) ?? ''
    const mediaUrl = (form.get('MediaUrl0') as string) ?? ''

    console.log(`[WhatsApp] from ${from} | body: "${body}" | media: ${numMedia} (${mediaType})`)

    let userMessage = ''

    if (numMedia > 0 && mediaType.startsWith('audio/')) {
      console.log('[WhatsApp] downloading voice note...')
      const audioBuffer = await downloadTwilioMedia(mediaUrl)
      console.log(`[WhatsApp] downloaded ${audioBuffer.length} bytes — transcribing...`)
      userMessage = await transcribeAudio(audioBuffer)
      console.log(`[WhatsApp] transcribed: "${userMessage}"`)
    } else if (body) {
      userMessage = body
    } else {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>I can't handle that type of message yet, but it's coming soon! Send me a text or voice note.</Message></Response>`
      return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
    }

    if (!userMessage) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>I didn't catch that — could you try again?</Message></Response>`
      return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
    }

    console.log('[WhatsApp] asking Gabby...')
    const gabbyReply = await askGabby(userMessage)
    console.log(`[WhatsApp] Gabby: "${gabbyReply}"`)

    console.log('[WhatsApp] generating voice note...')
    const audioUrl = await textToSpeechAndUpload(gabbyReply, `replies/${Date.now()}`)

    let xml: string
    if (audioUrl) {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>${xmlEscape(gabbyReply)}</Body>
    <Media>${audioUrl}</Media>
  </Message>
</Response>`
    } else {
      // Fallback to text-only if TTS fails
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>${xmlEscape(gabbyReply)}</Message></Response>`
    }

    console.log('[WhatsApp] reply sent —', audioUrl ? 'text + voice note' : 'text only (TTS failed)')
    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
  } catch (err) {
    console.error('[WhatsApp] unhandled error:', err)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response><Message>Sorry, I had a hiccup! Try again in a moment.</Message></Response>`
    return new NextResponse(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
  }
}
