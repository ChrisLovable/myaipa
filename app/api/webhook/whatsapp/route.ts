import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

export const runtime = 'nodejs'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const GABBY_SYSTEM_PROMPT = `You are Gabby, a friendly South African AI personal assistant from MyAIPA.

RULES:
- Keep replies short and natural, usually 1 to 3 sentences.
- Be warm, helpful and professional.
- Reply in the same language as the customer where possible.
- Never invent facts.
- Ask only one question at a time.
- You may chat with customers through WhatsApp.
- Do not claim that you sent an email, created an invoice, booked an appointment or completed another action unless that action was actually performed.
- If a requested capability is not connected yet, explain that honestly.`

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function getPublicWebhookUrl(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}${request.nextUrl.pathname}`
  }

  return request.url
}

async function logWhatsAppMessage(data: {
  phoneNumber: string
  direction: 'inbound' | 'outbound'
  messageBody?: string
  mediaUrl?: string
  messageSid?: string
  status?: string
}): Promise<void> {
  const { error } = await supabaseAdmin.from('whatsapp_messages').insert({
    phone_number: data.phoneNumber,
    direction: data.direction,
    message_body: data.messageBody || null,
    media_url: data.mediaUrl || null,
    twilio_message_sid: data.messageSid || null,
    status: data.status || null,
  })

  if (error) {
    console.error('[WhatsApp] Database logging error:', error.message)
  }
}

async function downloadTwilioMedia(mediaUrl: string): Promise<Buffer> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials are not configured')
  }

  const response = await fetch(mediaUrl, {
    headers: {
      Authorization:
        'Basic ' +
        Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    },
    redirect: 'follow',
  })

  if (!response.ok) {
    throw new Error(`Media download failed: ${response.status}`)
  }

  return Buffer.from(await response.arrayBuffer())
}

async function transcribeAudio(audioBuffer: Buffer): Promise<string> {
  const form = new FormData()

  form.append(
    'file',
    new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' }),
    'voice.ogg'
  )

  form.append('model_id', 'scribe_v1')

  const response = await fetch(
    'https://api.elevenlabs.io/v1/speech-to-text',
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
      },
      body: form,
    }
  )

  if (!response.ok) {
    console.error('[WhatsApp] Transcription error:', await response.text())
    throw new Error(`Transcription failed: ${response.status}`)
  }

  const result = await response.json()
  return result.text ?? ''
}

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
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    }),
  })

  if (!response.ok) {
    console.error('[WhatsApp] Claude error:', await response.text())
    throw new Error('Gabby response generation failed')
  }

  const result = await response.json()

  return result.content?.[0]?.text ?? 'Sorry, I did not understand that.'
}

async function synthesizeElevenLabs(
  text: string,
  modelId: string
): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID

  if (!apiKey || !voiceId) {
    console.error('[WhatsApp] ElevenLabs configuration is incomplete')
    return null
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  )

  console.log(`[WhatsApp TTS] ${modelId} status:`, response.status)

  if (!response.ok) {
    console.error(
      `[WhatsApp TTS] ${modelId} error:`,
      await response.text()
    )
    return null
  }

  return response.arrayBuffer()
}

async function textToSpeechAndUpload(
  text: string,
  folder: string
): Promise<string | null> {
  let audioBuffer = await synthesizeElevenLabs(
    text,
    'eleven_flash_v2_5'
  )

  if (!audioBuffer) {
    audioBuffer = await synthesizeElevenLabs(
      text,
      'eleven_multilingual_v2'
    )
  }

  if (!audioBuffer || audioBuffer.byteLength < 100) {
    return null
  }

  const path = `${folder}/${Date.now()}.mp3`

  const { error } = await supabaseAdmin.storage
    .from('whatsapp-audio')
    .upload(path, Buffer.from(audioBuffer), {
      contentType: 'audio/mpeg',
      upsert: true,
    })

  if (error) {
    console.error('[WhatsApp] Audio upload error:', error.message)
    return null
  }

  const { data } = supabaseAdmin.storage
    .from('whatsapp-audio')
    .getPublicUrl(path)

  return data.publicUrl
}

export async function POST(request: NextRequest) {
  try {
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const signature = request.headers.get('x-twilio-signature') ?? ''
    const rawBody = await request.text()
    const form = new URLSearchParams(rawBody)
    const parameters = Object.fromEntries(form.entries())

    if (!authToken) {
      console.error('[WhatsApp] TWILIO_AUTH_TOKEN is missing')

      return NextResponse.json(
        { success: false, error: 'Webhook is not configured' },
        { status: 503 }
      )
    }

    const webhookUrl = getPublicWebhookUrl(request)

    const validSignature = twilio.validateRequest(
      authToken,
      signature,
      webhookUrl,
      parameters
    )

    if (!validSignature) {
      console.warn('[WhatsApp] Invalid Twilio signature')

      return NextResponse.json(
        { success: false, error: 'Invalid webhook signature' },
        { status: 403 }
      )
    }

    const from = form.get('From') ?? ''
    const body = (form.get('Body') ?? '').trim()
    const messageSid = form.get('MessageSid') ?? ''
    const numMedia = Number.parseInt(form.get('NumMedia') ?? '0', 10)
    const mediaType = form.get('MediaContentType0') ?? ''
    const mediaUrl = form.get('MediaUrl0') ?? ''

    console.log(
      `[WhatsApp] From ${from} | SID ${messageSid} | Media ${numMedia}`
    )

    let userMessage = ''

    if (
      numMedia > 0 &&
      mediaType.startsWith('audio/') &&
      mediaUrl
    ) {
      const audioBuffer = await downloadTwilioMedia(mediaUrl)
      userMessage = await transcribeAudio(audioBuffer)
    } else if (body) {
      userMessage = body
    } else {
      const unsupportedReply =
        'I can currently respond to text messages and voice notes.'

      await logWhatsAppMessage({
        phoneNumber: from,
        direction: 'inbound',
        mediaUrl,
        messageSid,
        status: 'received',
      })

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${xmlEscape(unsupportedReply)}</Message>
</Response>`

      return new NextResponse(xml, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
        },
      })
    }

    if (!userMessage.trim()) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>I did not catch that. Please try again.</Message>
</Response>`

      return new NextResponse(xml, {
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
        },
      })
    }

    await logWhatsAppMessage({
      phoneNumber: from,
      direction: 'inbound',
      messageBody: userMessage,
      mediaUrl,
      messageSid,
      status: 'received',
    })

    const gabbyReply = await askGabby(userMessage)

    const audioUrl = await textToSpeechAndUpload(
      gabbyReply,
      `replies/${Date.now()}`
    )

    await logWhatsAppMessage({
      phoneNumber: from,
      direction: 'outbound',
      messageBody: gabbyReply,
      mediaUrl: audioUrl ?? undefined,
      status: 'queued',
    })

    const xml = audioUrl
      ? `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>
    <Body>${xmlEscape(gabbyReply)}</Body>
    <Media>${xmlEscape(audioUrl)}</Media>
  </Message>
</Response>`
      : `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${xmlEscape(gabbyReply)}</Message>
</Response>`

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('[WhatsApp] Unhandled webhook error:', error)

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Sorry, I had a temporary problem. Please try again shortly.</Message>
</Response>`

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
      },
      status: 200,
    })
  }
}
