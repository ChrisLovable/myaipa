import { NextRequest, NextResponse } from 'next/server'

async function synthesizeElevenLabs(
  apiKey: string,
  voiceId: string,
  text: string,
  modelId: string,
): Promise<ArrayBuffer | null> {
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

  console.log(`[TTS] ElevenLabs ${modelId} status:`, response.status)

  if (!response.ok) {
    console.error(`[TTS] ${modelId} error:`, await response.text())
    return null
  }

  return response.arrayBuffer()
}

export async function POST(request: NextRequest) {
  try {
    const { text, language } = await request.json()

    console.log(`[TTS] called — lang: ${language ?? 'af'} | text length: ${text?.length}`)

    if (!text) {
      return NextResponse.json({ error: 'No text' }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    const voiceId = process.env.ELEVENLABS_VOICE_ID
    if (!apiKey || !voiceId) {
      console.error('[TTS] ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID missing')
      return NextResponse.json({ error: 'API key missing' }, { status: 500 })
    }

    // Flash first (~75ms latency), multilingual_v2 as fallback
    let audioBuffer = await synthesizeElevenLabs(apiKey, voiceId, text, 'eleven_flash_v2_5')
    if (!audioBuffer) {
      console.log('[TTS] Flash failed — falling back to eleven_multilingual_v2')
      audioBuffer = await synthesizeElevenLabs(apiKey, voiceId, text, 'eleven_multilingual_v2')
    }

    if (!audioBuffer || audioBuffer.byteLength < 100) {
      return NextResponse.json({ error: 'TTS synthesis failed' }, { status: 500 })
    }

    console.log('[TTS] audio buffer size:', audioBuffer.byteLength)

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('[TTS] route error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
